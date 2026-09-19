/**
 * Core TaskScheduler coordinating task priority queue, concurrency tokens, and executor dispatching.
 */

import { PriorityQueue } from "./priority-queue.js";
import { ConcurrencyLimiter } from "./concurrency.js";
import type { ExecutionContext } from "../core/execution.js";
import type { Executor } from "../core/executor.js";
import type { RuntimeEventEmitter } from "../observability/events.js";
import type { LifecycleManager } from "../core/lifecycle.js";
import { RuntimeError } from "../execution/error.js";

export interface ScheduledTask<TInput = unknown, TOutput = unknown> {
  context: ExecutionContext<TInput, TOutput>;
  executor: Executor;
  resolve: (value: TOutput) => void;
  reject: (reason: unknown) => void;
  cleanupQueueSignal?: () => void;
}

export interface TaskSchedulerOptions {
  maxConcurrency?: number;
  maxQueueSize?: number;
  overflowStrategy?: "reject" | "drop_oldest";
  eventEmitter?: RuntimeEventEmitter;
  lifecycleManager?: LifecycleManager;
}

export class TaskScheduler {
  private readonly queue = new PriorityQueue<ScheduledTask<any, any>>();
  private readonly concurrency: ConcurrencyLimiter;
  private readonly eventEmitter?: RuntimeEventEmitter;
  private readonly lifecycleManager?: LifecycleManager;
  private readonly maxQueueSize: number;
  private readonly overflowStrategy: "reject" | "drop_oldest";
  private isDispatching = false;
  private idleResolvers: Array<() => void> = [];

  constructor(options: TaskSchedulerOptions = {}) {
    this.concurrency = new ConcurrencyLimiter({ maxConcurrency: options.maxConcurrency });
    this.eventEmitter = options.eventEmitter;
    this.lifecycleManager = options.lifecycleManager;
    this.maxQueueSize = options.maxQueueSize && options.maxQueueSize > 0 ? options.maxQueueSize : 0;
    this.overflowStrategy = options.overflowStrategy ?? "reject";
  }

  get pendingCount(): number {
    return this.queue.size;
  }

  get runningCount(): number {
    return this.concurrency.activeGlobal;
  }

  get maxConcurrency(): number {
    return this.concurrency.maxConcurrency;
  }

  setMaxConcurrency(limit: number): void {
    this.concurrency.setGlobalLimit(limit);
    this.dispatch();
  }

  setTaskConcurrency(taskName: string, limit: number): void {
    this.concurrency.setTaskLimit(taskName, limit);
    this.dispatch();
  }

  async onIdle(): Promise<void> {
    if (this.queue.isEmpty && this.concurrency.activeGlobal === 0) {
      return;
    }
    return new Promise<void>((resolve) => {
      this.idleResolvers.push(resolve);
    });
  }

  private notifyIdle(): void {
    if (this.queue.isEmpty && this.concurrency.activeGlobal === 0) {
      while (this.idleResolvers.length > 0) {
        const resolve = this.idleResolvers.shift();
        resolve?.();
      }
    }
  }

  submit<TInput, TOutput>(
    context: ExecutionContext<TInput, TOutput>,
    executor: Executor
  ): Promise<TOutput> {
    if (this.lifecycleManager) {
      this.lifecycleManager.assertAcceptingTasks();
    }

    if (context.isAborted) {
      const err =
        context.error ??
        RuntimeError.cancelled("Task aborted before execution", {
          taskId: context.taskId,
          executionId: context.executionId,
          executor: context.executorType,
        });
      return Promise.reject(err);
    }

    // Backpressure enforcement
    if (this.maxQueueSize > 0 && this.queue.size >= this.maxQueueSize) {
      if (this.overflowStrategy === "drop_oldest") {
        const dropped = this.queue.dequeue();
        if (dropped) {
          dropped.cleanupQueueSignal?.();
          dropped.reject(
            new RuntimeError({
              code: "QUEUE_FULL",
              message: `Task dropped from queue due to queue limit (${this.maxQueueSize})`,
              taskId: dropped.context.taskId,
              executionId: dropped.context.executionId,
              executor: dropped.context.executorType,
            })
          );
        }
      } else {
        const overflowErr = new RuntimeError({
          code: "QUEUE_FULL",
          message: `Scheduler queue is full (max limit: ${this.maxQueueSize})`,
          taskId: context.taskId,
          executionId: context.executionId,
          executor: context.executorType,
        });
        return Promise.reject(overflowErr);
      }
    }

    return new Promise<TOutput>((resolve, reject) => {
      let cleanupQueueSignal: (() => void) | undefined;

      const task: ScheduledTask<TInput, TOutput> = {
        context,
        executor,
        resolve,
        reject,
        cleanupQueueSignal: () => {
          if (cleanupQueueSignal) {
            cleanupQueueSignal();
            cleanupQueueSignal = undefined;
          }
        },
      };

      context.markQueued();
      this.eventEmitter?.emit("task:queued", {
        taskId: context.taskId,
        executionId: context.executionId,
        taskName: context.taskName,
        priority: context.priority,
      });

      // Handle cancellation while waiting in queue
      if (context.signal) {
        const onAbort = () => {
          const removed = this.queue.remove((item) => item.context.executionId === context.executionId);
          if (removed) {
            if (cleanupQueueSignal) {
              cleanupQueueSignal();
              cleanupQueueSignal = undefined;
            }
            const cancelErr = context.markCancelled(
              context.signal.reason ? String(context.signal.reason) : "Cancelled while in queue"
            );
            this.eventEmitter?.emit("task:cancel", {
              taskId: context.taskId,
              executionId: context.executionId,
              taskName: context.taskName,
              stage: "queued",
              reason: cancelErr.message,
            });
            reject(cancelErr);
          }
        };
        context.signal.addEventListener("abort", onAbort, { once: true });
        cleanupQueueSignal = () => {
          context.signal.removeEventListener("abort", onAbort);
        };
      }

      this.queue.enqueue(task, context.priority);
      this.dispatch();
    });
  }

  private dispatch(): void {
    if (this.isDispatching) {
      return;
    }

    this.isDispatching = true;
    try {
      while (!this.queue.isEmpty) {
        const top = this.queue.peek();
        if (!top) break;

        let candidate: ScheduledTask<any, any> | undefined;

        // Fast-path: top priority task can be acquired directly
        const topTaskKey = top.context.taskName;
        const topTaskLimit = top.context.options.concurrency;

        if (this.concurrency.canAcquire(topTaskKey, topTaskLimit)) {
          candidate = this.queue.dequeue()!;
        } else {
          // Slow-path: top item is limited by per-task concurrency; find highest-priority runnable candidate in O(N)
          candidate = this.queue.dequeueMatching((item) => {
            return this.concurrency.canAcquire(
              item.context.taskName,
              item.context.options.concurrency
            );
          });

          if (!candidate) {
            // No task currently can be acquired due to concurrency limits
            break;
          }
        }

        candidate.cleanupQueueSignal?.();

        if (candidate.context.isAborted) {
          const err =
            candidate.context.error ??
            RuntimeError.cancelled("Task cancelled while in queue", {
              taskId: candidate.context.taskId,
              executionId: candidate.context.executionId,
              executor: candidate.context.executorType,
            });
          candidate.reject(err);
          continue;
        }

        // Acquire concurrency slots
        const taskKey = candidate.context.taskName;
        const release = this.concurrency.acquire(taskKey);

        this.executeTask(candidate, release);
      }
    } finally {
      this.isDispatching = false;
    }
  }

  private async executeTask(
    scheduled: ScheduledTask<any, any>,
    releaseConcurrency: () => void
  ): Promise<void> {
    const { context, executor, resolve, reject } = scheduled;

    this.lifecycleManager?.registerExecution(context);
    context.markRunning();

    this.eventEmitter?.emit("task:start", {
      taskId: context.taskId,
      executionId: context.executionId,
      taskName: context.taskName,
      executor: context.executorType,
      retryCount: context.retryCount,
      timestamp: context.startedAt ?? Date.now(),
    });

    try {
      const result = await executor.execute(context);

      if (context.status === "timed_out" || context.status === "cancelled") {
        const cancelErr =
          context.error ??
          (context.status === "timed_out"
            ? RuntimeError.timeout(context.options.timeout ?? 0, {
                taskId: context.taskId,
                executionId: context.executionId,
                executor: context.executorType,
              })
            : RuntimeError.cancelled("Task cancelled", {
                taskId: context.taskId,
                executionId: context.executionId,
                executor: context.executorType,
              }));
        reject(cancelErr);
        return;
      }

      context.markCompleted(result);

      this.eventEmitter?.emit("task:complete", {
        taskId: context.taskId,
        executionId: context.executionId,
        taskName: context.taskName,
        executor: context.executorType,
        durationMs: context.durationMs ?? 0,
        result,
      });

      resolve(result);
    } catch (err: unknown) {
      if (context.status === "timed_out" || (context.error && context.error.timeout)) {
        const timeoutErr = context.error ?? context.markTimedOut(context.options.timeout ?? 0);
        this.eventEmitter?.emit("task:error", {
          taskId: context.taskId,
          executionId: context.executionId,
          taskName: context.taskName,
          executor: context.executorType,
          durationMs: context.durationMs ?? 0,
          error: timeoutErr,
        });
        reject(timeoutErr);
      } else if (context.isAborted && context.error) {
        this.eventEmitter?.emit("task:cancel", {
          taskId: context.taskId,
          executionId: context.executionId,
          taskName: context.taskName,
          stage: "running",
          reason: context.error.message,
        });
        reject(context.error);
      } else {
        const runtimeErr = context.markFailed(err);
        this.eventEmitter?.emit("task:error", {
          taskId: context.taskId,
          executionId: context.executionId,
          taskName: context.taskName,
          executor: context.executorType,
          durationMs: context.durationMs ?? 0,
          error: runtimeErr,
        });
        reject(runtimeErr);
      }
    } finally {
      releaseConcurrency();
      this.lifecycleManager?.unregisterExecution(context);
      this.notifyIdle();
      // Trigger dispatch on next tick to process waiting queue items
      process.nextTick(() => this.dispatch());
    }
  }

  clear(reason = "Scheduler queue cleared"): void {
    while (!this.queue.isEmpty) {
      const item = this.queue.dequeue();
      if (item) {
        const err = item.context.markCancelled(reason);
        item.reject(err);
      }
    }
  }
}
