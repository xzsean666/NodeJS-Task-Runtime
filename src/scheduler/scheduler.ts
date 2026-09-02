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
}

export interface TaskSchedulerOptions {
  maxConcurrency?: number;
  eventEmitter?: RuntimeEventEmitter;
  lifecycleManager?: LifecycleManager;
}

export class TaskScheduler {
  private readonly queue = new PriorityQueue<ScheduledTask<any, any>>();
  private readonly concurrency: ConcurrencyLimiter;
  private readonly eventEmitter?: RuntimeEventEmitter;
  private readonly lifecycleManager?: LifecycleManager;
  private isDispatching = false;

  constructor(options: TaskSchedulerOptions = {}) {
    this.concurrency = new ConcurrencyLimiter({ maxConcurrency: options.maxConcurrency });
    this.eventEmitter = options.eventEmitter;
    this.lifecycleManager = options.lifecycleManager;
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

    return new Promise<TOutput>((resolve, reject) => {
      const task: ScheduledTask<TInput, TOutput> = {
        context,
        executor,
        resolve,
        reject,
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
            const cancelErr = context.markCancelled(
              context.signal.reason ? String(context.signal.reason) : "Cancelled while in queue"
            );
            this.eventEmitter?.emit("task:cancel", {
              taskId: context.taskId,
              executionId: context.executionId,
              taskName: context.taskName,
              reason: cancelErr.message,
            });
            reject(cancelErr);
          }
        };
        context.signal.addEventListener("abort", onAbort, { once: true });
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
        const items = this.queue.toArray();
        let candidateIndex = -1;

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const taskKey = item.context.taskName;
          const taskLimit = item.context.options.concurrency;

          if (this.concurrency.canAcquire(taskKey, taskLimit)) {
            candidateIndex = i;
            break;
          }
        }

        if (candidateIndex === -1) {
          // No task currently can be acquired due to concurrency limits
          break;
        }

        const candidate = items[candidateIndex];
        // Remove this candidate from queue
        this.queue.remove((item) => item.context.executionId === candidate.context.executionId);

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
      if (context.isAborted && context.error) {
        this.eventEmitter?.emit("task:cancel", {
          taskId: context.taskId,
          executionId: context.executionId,
          taskName: context.taskName,
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
