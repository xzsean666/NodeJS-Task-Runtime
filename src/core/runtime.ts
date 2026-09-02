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

import { resolveWorkerCount } from "../resource/cpu.js";
import type { Logger } from "../observability/logger.js";

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

    if (options.logger) {
      this.bindLogger(options.logger);
    }

    this.lifecycle = new LifecycleManager({
      eventEmitter: this.events,
      shutdownTimeout: options.shutdownTimeout,
    });

    const defaultWorkerCount = resolveWorkerCount(options.workers);
    const resolvedMaxConcurrency =
      options.maxConcurrency !== undefined
        ? options.maxConcurrency
        : (options.defaultExecutor === "process" || options.defaultExecutor === "cli" ? 0 : defaultWorkerCount);

    this.scheduler = new TaskScheduler({
      maxConcurrency: resolvedMaxConcurrency,
      eventEmitter: this.events,
      lifecycleManager: this.lifecycle,
    });

    this.threadExecutor = new ThreadExecutor(
      { size: defaultWorkerCount },
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
              onTimeout: async () => {
                context.markTimedOut(timeoutMs);
                this.events.emit("task:timeout", {
                  taskId: context.taskId,
                  executionId: context.executionId,
                  taskName: mergedOptions.name,
                  timeoutMs,
                });
                await executor.terminate(context.executionId, "Timeout");
              },
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
        },
        mergedOptions.signal
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
    this.scheduler.clear("Runtime destroyed");
    await Promise.allSettled([
      this.threadExecutor.destroy(),
      this.processExecutor.destroy(),
      this.cliExecutor.destroy(),
    ]);
  }

  private bindLogger(logger: Logger): void {
    this.events.on("lifecycle:change", ({ from, to }) => {
      logger.info(`Runtime lifecycle changed: ${from} -> ${to}`);
    });
    this.events.on("task:start", ({ taskId, taskName, executor, retryCount }) => {
      logger.debug(`Task started: [${taskId}] ${taskName ?? "anonymous"} (executor: ${executor}, attempt: ${retryCount + 1})`);
    });
    this.events.on("task:complete", ({ taskId, taskName, durationMs }) => {
      logger.debug(`Task completed: [${taskId}] ${taskName ?? "anonymous"} in ${durationMs}ms`);
    });
    this.events.on("task:error", ({ taskId, taskName, error, durationMs }) => {
      logger.error(`Task error: [${taskId}] ${taskName ?? "anonymous"} in ${durationMs}ms: ${error.message}`);
    });
    this.events.on("task:timeout", ({ taskId, taskName, timeoutMs }) => {
      logger.warn(`Task timed out: [${taskId}] ${taskName ?? "anonymous"} after ${timeoutMs}ms`);
    });
    this.events.on("task:retry", ({ taskId, taskName, attempt, delayMs, error }) => {
      logger.warn(`Task retry: [${taskId}] ${taskName ?? "anonymous"} (attempt ${attempt}) waiting ${delayMs}ms due to: ${error.message}`);
    });
    this.events.on("worker:spawn", ({ workerId, type }) => {
      logger.debug(`Worker spawned: [${workerId}] (type: ${type})`);
    });
    this.events.on("worker:crash", ({ workerId, error }) => {
      logger.error(`Worker crashed: [${workerId}]: ${error.message}`);
    });
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
