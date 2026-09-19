/**
 * Main TaskRuntime aggregation class.
 */

import type {
  RuntimeOptions,
  TaskOptions,
  CliTaskOptions,
  RuntimeStats,
  ActiveTaskInfo,
  TaskHandler,
  ExecutorType,
  LifecycleState,
  TaskMiddleware,
} from "./types.js";
import { LifecycleManager } from "./lifecycle.js";
import { ExecutionContext } from "./execution.js";
import { TaskScheduler } from "../scheduler/scheduler.js";
import { randomUUID } from "node:crypto";
import { ThreadExecutor } from "../executors/thread/executor.js";
import { ProcessExecutor } from "../executors/process/executor.js";
import { CLIExecutor } from "../executors/cli/executor.js";
import {
  RuntimeEventEmitter,
  type RuntimeEventMap,
  type RuntimeEventListener,
} from "../observability/events.js";
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
  private readonly middlewares: TaskMiddleware[] = [];

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

    if (options.middlewares && options.middlewares.length > 0) {
      this.middlewares.push(...options.middlewares);
    }

    this.lifecycle = new LifecycleManager({
      eventEmitter: this.events,
      shutdownTimeout: options.shutdownTimeout,
    });

    const defaultWorkerCount = resolveWorkerCount(options.workers);
    const resolvedMaxConcurrency =
      options.maxConcurrency !== undefined
        ? options.maxConcurrency
        : options.defaultExecutor === "process" || options.defaultExecutor === "cli"
        ? 0
        : defaultWorkerCount;

    this.scheduler = new TaskScheduler({
      maxConcurrency: resolvedMaxConcurrency,
      maxQueueSize: options.maxQueueSize,
      overflowStrategy: options.overflowStrategy,
      eventEmitter: this.events,
      lifecycleManager: this.lifecycle,
    });

    // Link scheduler idle status with lifecycle draining
    this.lifecycle.setDrainChecker(
      () => this.scheduler.pendingCount === 0 && this.scheduler.runningCount === 0
    );

    this.threadExecutor = new ThreadExecutor(
      { size: defaultWorkerCount },
      this.events
    );
    this.processExecutor = new ProcessExecutor();
    this.cliExecutor = new CLIExecutor();

    if (options.eager) {
      this.warmup().catch(() => {});
    }
  }

  get state(): LifecycleState {
    return this.lifecycle.state;
  }

  /**
   * Pre-spawns all worker threads and waits until they are fully initialized and ready.
   */
  async warmup(): Promise<void> {
    await this.threadExecutor.warmup();
  }

  /**
   * Registers a global middleware executed around every task.
   */
  use(middleware: TaskMiddleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Dynamically resizes the worker thread pool.
   */
  resizeWorkers(newSize: number): void {
    this.threadExecutor.resize(newSize);
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

      const rootTaskId = mergedOptions.taskId ?? `task_${randomUUID()}`;

      const activeMiddlewares: TaskMiddleware[] = [
        ...this.middlewares,
        ...(mergedOptions.middlewares ?? []),
      ];

      return withRetry(
        (attempt) => {
          const context = new ExecutionContext<TInput, TOutput>({
            taskId: rootTaskId,
            input,
            options: mergedOptions,
            executorType,
            retryCount: attempt - 1,
            taskName: mergedOptions.name,
            priority: mergedOptions.priority,
            onProgress: (progEvent) => {
              this.events.emit("task:progress", progEvent);
            },
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

          const coreExecution = () => {
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
          };

          // Apply middleware chain if present
          if (activeMiddlewares.length > 0) {
            let index = -1;
            const dispatchMiddleware = (i: number): Promise<TOutput> => {
              if (i <= index) {
                return Promise.reject(new Error("next() called multiple times in middleware"));
              }
              index = i;
              if (i === activeMiddlewares.length) {
                return coreExecution();
              }
              const fn = activeMiddlewares[i];
              return Promise.resolve(
                fn(context, () => dispatchMiddleware(i + 1))
              );
            };
            return dispatchMiddleware(0);
          }

          return coreExecution();
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
    command: string | ((input: TInput, context: any) => string),
    cliOptions: CliTaskOptions<TInput> = { command }
  ): TaskCallable<TInput, TOutput> {
    const fullOptions: TaskOptions<TInput> = {
      ...cliOptions,
      executor: "cli",
      command: cliOptions.command ?? command,
      metadata: {
        ...cliOptions.metadata,
        command: typeof command === "string" ? command : undefined,
      },
    };

    return this.task<TInput, TOutput>(
      typeof command === "string" ? command : "dynamic-cli",
      fullOptions
    );
  }

  /**
   * Chains multiple tasks or functions into a sequential pipeline with end-to-end type safety.
   */
  pipeline<T1, T2>(
    t1: TaskCallable<T1, T2> | ((arg: T1) => Promise<T2> | T2)
  ): TaskCallable<T1, T2>;
  pipeline<T1, T2, T3>(
    t1: TaskCallable<T1, T2> | ((arg: T1) => Promise<T2> | T2),
    t2: TaskCallable<T2, T3> | ((arg: T2) => Promise<T3> | T3)
  ): TaskCallable<T1, T3>;
  pipeline<T1, T2, T3, T4>(
    t1: TaskCallable<T1, T2> | ((arg: T1) => Promise<T2> | T2),
    t2: TaskCallable<T2, T3> | ((arg: T2) => Promise<T3> | T3),
    t3: TaskCallable<T3, T4> | ((arg: T3) => Promise<T4> | T4)
  ): TaskCallable<T1, T4>;
  pipeline<T1, T2, T3, T4, T5>(
    t1: TaskCallable<T1, T2> | ((arg: T1) => Promise<T2> | T2),
    t2: TaskCallable<T2, T3> | ((arg: T2) => Promise<T3> | T3),
    t3: TaskCallable<T3, T4> | ((arg: T3) => Promise<T4> | T4),
    t4: TaskCallable<T4, T5> | ((arg: T4) => Promise<T5> | T5)
  ): TaskCallable<T1, T5>;
  pipeline<T1, T2, T3, T4, T5, T6>(
    t1: TaskCallable<T1, T2> | ((arg: T1) => Promise<T2> | T2),
    t2: TaskCallable<T2, T3> | ((arg: T2) => Promise<T3> | T3),
    t3: TaskCallable<T3, T4> | ((arg: T3) => Promise<T4> | T4),
    t4: TaskCallable<T4, T5> | ((arg: T4) => Promise<T5> | T5),
    t5: TaskCallable<T5, T6> | ((arg: T5) => Promise<T6> | T6)
  ): TaskCallable<T1, T6>;
  pipeline<T1, T2, T3, T4, T5, T6, T7>(
    t1: TaskCallable<T1, T2> | ((arg: T1) => Promise<T2> | T2),
    t2: TaskCallable<T2, T3> | ((arg: T2) => Promise<T3> | T3),
    t3: TaskCallable<T3, T4> | ((arg: T3) => Promise<T4> | T4),
    t4: TaskCallable<T4, T5> | ((arg: T4) => Promise<T5> | T5),
    t5: TaskCallable<T5, T6> | ((arg: T5) => Promise<T6> | T6),
    t6: TaskCallable<T6, T7> | ((arg: T6) => Promise<T7> | T7)
  ): TaskCallable<T1, T7>;
  pipeline<T1, T2, T3, T4, T5, T6, T7, T8>(
    t1: TaskCallable<T1, T2> | ((arg: T1) => Promise<T2> | T2),
    t2: TaskCallable<T2, T3> | ((arg: T2) => Promise<T3> | T3),
    t3: TaskCallable<T3, T4> | ((arg: T3) => Promise<T4> | T4),
    t4: TaskCallable<T4, T5> | ((arg: T4) => Promise<T5> | T5),
    t5: TaskCallable<T5, T6> | ((arg: T5) => Promise<T6> | T6),
    t6: TaskCallable<T6, T7> | ((arg: T6) => Promise<T7> | T7),
    t7: TaskCallable<T7, T8> | ((arg: T7) => Promise<T8> | T8)
  ): TaskCallable<T1, T8>;
  pipeline(
    ...tasks: Array<TaskCallable<any, any> | ((input: any) => any)>
  ): TaskCallable<any, any> {
    if (tasks.length === 0) {
      throw new Error("Pipeline requires at least one task");
    }

    let current =
      typeof tasks[0] === "function" && "batch" in tasks[0]
        ? (tasks[0] as TaskCallable<any, any>)
        : this.task(tasks[0] as any);

    for (let i = 1; i < tasks.length; i++) {
      current = current.pipe(tasks[i] as any);
    }

    return current;
  }

  async all<T>(tasks: Array<(() => Promise<T>) | Promise<T>>): Promise<T[]> {
    const promises = tasks.map((t) => (typeof t === "function" ? t() : t));
    return Promise.all(promises);
  }

  stats(): RuntimeStats {
    const threadStats = this.threadExecutor.stats();
    return this.metrics.getStats(threadStats);
  }

  /**
   * Returns a real-time snapshot of all currently active task executions.
   */
  getActiveTasks(): ActiveTaskInfo[] {
    const executions = this.lifecycle.getActiveExecutions();
    return executions.map((ctx) => ({
      taskId: ctx.taskId,
      executionId: ctx.executionId,
      taskName: ctx.taskName,
      executor: ctx.executorType,
      status: ctx.status,
      durationMs: ctx.startedAt ? Date.now() - ctx.startedAt : 0,
      progress: ctx.progress,
      priority: ctx.priority,
      retryCount: ctx.retryCount,
    }));
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
    this.events.on(
      "task:start",
      ({ taskId, taskName, executor, retryCount }) => {
        logger.debug(
          `Task started: [${taskId}] ${taskName ?? "anonymous"} (executor: ${executor}, attempt: ${retryCount + 1})`
        );
      }
    );
    this.events.on("task:complete", ({ taskId, taskName, durationMs }) => {
      logger.debug(
        `Task completed: [${taskId}] ${taskName ?? "anonymous"} in ${durationMs}ms`
      );
    });
    this.events.on("task:error", ({ taskId, taskName, error, durationMs }) => {
      logger.error(
        `Task error: [${taskId}] ${taskName ?? "anonymous"} in ${durationMs}ms: ${error.message}`
      );
    });
    this.events.on("task:timeout", ({ taskId, taskName, timeoutMs }) => {
      logger.warn(
        `Task timed out: [${taskId}] ${taskName ?? "anonymous"} after ${timeoutMs}ms`
      );
    });
    this.events.on(
      "task:retry",
      ({ taskId, taskName, attempt, delayMs, error }) => {
        logger.warn(
          `Task retry: [${taskId}] ${taskName ?? "anonymous"} (attempt ${attempt}) waiting ${delayMs}ms due to: ${error.message}`
        );
      }
    );
    this.events.on("task:progress", ({ taskId, taskName, progress, message }) => {
      logger.debug(
        `Task progress: [${taskId}] ${taskName ?? "anonymous"}: ${progress}%${message ? ` - ${message}` : ""}`
      );
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
