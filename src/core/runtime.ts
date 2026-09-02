/**
 * Main TaskRuntime aggregation class.
 */

import type {
  RuntimeOptions,
  TaskOptions,
  CliTaskOptions,
  RuntimeStats,
  TaskHandler,
  ExecutorType,
  LifecycleState,
} from "./types.js";
import { LifecycleManager } from "./lifecycle.js";
import { ExecutionContext } from "./execution.js";
import { TaskScheduler } from "../scheduler/scheduler.js";
import { ThreadExecutor } from "../executors/thread/executor.js";
import { ProcessExecutor } from "../executors/process/executor.js";
import { CLIExecutor } from "../executors/cli/executor.js";
import { RuntimeEventEmitter, type RuntimeEventMap, type RuntimeEventListener } from "../observability/events.js";
import { MetricsCollector } from "../observability/metrics.js";
import { createTaskCallable, type TaskCallable } from "./task.js";
import { withRetry } from "../execution/retry.js";
import { withTimeout } from "../execution/timeout.js";
import { normalizeRetryOptions } from "../execution/retry.js";
import type { Executor } from "./executor.js";

export class TaskRuntime {
  readonly options: RuntimeOptions;
  readonly events: RuntimeEventEmitter;
  private readonly lifecycle: LifecycleManager;
  private readonly metrics: MetricsCollector;
  private readonly scheduler: TaskScheduler;

  private readonly threadExecutor: ThreadExecutor;
  private readonly processExecutor: ProcessExecutor;
  private readonly cliExecutor: CLIExecutor;

  constructor(options: RuntimeOptions = {}) {
    this.options = options;
    this.events = new RuntimeEventEmitter();
    this.metrics = new MetricsCollector(this.events);

    this.lifecycle = new LifecycleManager({
      eventEmitter: this.events,
      shutdownTimeout: options.shutdownTimeout,
    });

    this.scheduler = new TaskScheduler({
      maxConcurrency: options.maxConcurrency,
      eventEmitter: this.events,
      lifecycleManager: this.lifecycle,
    });

    this.threadExecutor = new ThreadExecutor(
      { size: options.workers },
      this.events
    );
    this.processExecutor = new ProcessExecutor();
    this.cliExecutor = new CLIExecutor();
  }

  get state(): LifecycleState {
    return this.lifecycle.state;
  }

  task<TInput = unknown, TOutput = unknown>(
    handler: TaskHandler<TInput, TOutput> | string,
    taskOptions: TaskOptions<TInput> = {}
  ): TaskCallable<TInput, TOutput> {
    const executorRunner = (
      input: TInput,
      runOptions: Partial<TaskOptions<TInput>> = {}
    ): Promise<TOutput> => {
      const mergedOptions: TaskOptions<TInput> = {
        ...this.options,
        ...taskOptions,
        ...runOptions,
      };

      const retryOpts = normalizeRetryOptions(
        mergedOptions.retry ?? this.options.defaultRetry
      );

      const timeoutMs =
        mergedOptions.timeout ?? this.options.defaultTimeout ?? 0;

      const executorType =
        mergedOptions.executor ?? this.options.defaultExecutor ?? "thread";

      return withRetry(
        (attempt) => {
          const context = new ExecutionContext<TInput, TOutput>({
            input,
            options: mergedOptions,
            executorType,
            retryCount: attempt - 1,
            taskName: mergedOptions.name,
            priority: mergedOptions.priority,
          });

          // Attach handler function to context
          (context as any).handler = handler;
          if (typeof handler === "string") {
            context.options.metadata = {
              ...context.options.metadata,
              modulePath: handler,
            };
          }

          const executor = this.getExecutor(executorType);

          const execPromise = () => this.scheduler.submit(context, executor);

          if (timeoutMs > 0) {
            return withTimeout(execPromise, {
              timeoutMs,
              taskId: context.taskId,
              executionId: context.executionId,
              executor: executorType,
              onTimeout: () => executor.terminate(context.executionId, "Timeout"),
            });
          }

          return execPromise();
        },
        retryOpts,
        (retryEvent) => {
          this.events.emit("task:retry", {
            taskId: retryEvent.error.taskId ?? "unknown",
            executionId: retryEvent.error.executionId ?? "unknown",
            taskName: mergedOptions.name,
            attempt: retryEvent.attempt,
            maxAttempts: retryEvent.maxAttempts,
            delayMs: retryEvent.delayMs,
            error: retryEvent.error,
          });
        }
      );
    };

    return createTaskCallable(executorRunner, taskOptions);
  }

  cli<TInput = unknown, TOutput = unknown>(
    command: string,
    cliOptions: CliTaskOptions<TInput> = { command }
  ): TaskCallable<TInput, TOutput> {
    const fullOptions: TaskOptions<TInput> = {
      ...cliOptions,
      executor: "cli",
      metadata: {
        ...cliOptions.metadata,
        command,
      },
    };

    return this.task<TInput, TOutput>(command, fullOptions);
  }

  async all<T>(tasks: Array<(() => Promise<T>) | Promise<T>>): Promise<T[]> {
    const promises = tasks.map((t) => (typeof t === "function" ? t() : t));
    return Promise.all(promises);
  }

  stats(): RuntimeStats {
    const threadStats = this.threadExecutor.stats();
    return this.metrics.getStats(threadStats);
  }

  on<K extends keyof RuntimeEventMap>(
    event: K,
    listener: RuntimeEventListener<K>
  ): this {
    this.events.on(event, listener);
    return this;
  }

  once<K extends keyof RuntimeEventMap>(
    event: K,
    listener: RuntimeEventListener<K>
  ): this {
    this.events.once(event, listener);
    return this;
  }

  off<K extends keyof RuntimeEventMap>(
    event: K,
    listener: RuntimeEventListener<K>
  ): this {
    this.events.off(event, listener);
    return this;
  }

  async shutdown(timeoutMs?: number): Promise<void> {
    await this.lifecycle.shutdown(timeoutMs);
    await this.destroy();
  }

  async destroy(): Promise<void> {
    this.lifecycle.forceStop();
    await Promise.allSettled([
      this.threadExecutor.destroy(),
      this.processExecutor.destroy(),
      this.cliExecutor.destroy(),
    ]);
  }

  private getExecutor(type: ExecutorType): Executor {
    switch (type) {
      case "thread":
        return this.threadExecutor;
      case "process":
        return this.processExecutor;
      case "cli":
        return this.cliExecutor;
      default:
        return this.threadExecutor;
    }
  }
}
