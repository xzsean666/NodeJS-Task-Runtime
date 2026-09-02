/**
 * Execution context tracking individual task invocation state and metadata.
 */

import { randomUUID } from "node:crypto";
import type {
  ExecutionStatus,
  ExecutorType,
  TaskOptions,
} from "./types.js";
import { RuntimeError } from "../execution/error.js";

export interface ExecutionContextOptions<TInput = unknown> {
  taskId?: string;
  executionId?: string;
  taskName?: string;
  input: TInput;
  options?: TaskOptions<TInput>;
  executorType?: ExecutorType;
  retryCount?: number;
  priority?: number;
}

export class ExecutionContext<TInput = unknown, TOutput = unknown> {
  readonly taskId: string;
  readonly executionId: string;
  readonly taskName?: string;
  readonly input: TInput;
  readonly options: TaskOptions<TInput>;
  executorType: ExecutorType;
  priority: number;

  status: ExecutionStatus;
  retryCount: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;

  result?: TOutput;
  error?: RuntimeError;

  private readonly abortController: AbortController;
  private userSignalCleanup?: () => void;

  constructor(options: ExecutionContextOptions<TInput>) {
    this.taskId = options.taskId ?? `task_${randomUUID()}`;
    this.executionId = options.executionId ?? `exec_${randomUUID()}`;
    this.taskName = options.taskName ?? options.options?.name;
    this.input = options.input;
    this.options = options.options ?? {};
    this.executorType = options.executorType ?? options.options?.executor ?? "thread";
    this.priority = options.priority ?? options.options?.priority ?? 0;
    this.retryCount = options.retryCount ?? 0;

    this.status = "pending";
    this.createdAt = Date.now();

    this.abortController = new AbortController();

    // Link user-supplied AbortSignal if present
    if (this.options.signal) {
      if (this.options.signal.aborted) {
        this.abortController.abort(this.options.signal.reason);
        this.status = "cancelled";
        this.error = RuntimeError.cancelled(
          this.options.signal.reason
            ? String(this.options.signal.reason)
            : "Aborted by signal",
          { taskId: this.taskId, executionId: this.executionId, executor: this.executorType }
        );
      } else {
        const onAbort = () => {
          this.abort(
            this.options.signal?.reason
              ? String(this.options.signal.reason)
              : "Aborted by signal"
          );
        };
        this.options.signal.addEventListener("abort", onAbort, { once: true });
        this.userSignalCleanup = () => {
          this.options.signal?.removeEventListener("abort", onAbort);
        };
      }
    }
  }

  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  get isAborted(): boolean {
    return this.abortController.signal.aborted;
  }

  markQueued(): void {
    if (this.status === "pending") {
      this.status = "queued";
    }
  }

  markRunning(): void {
    this.status = "running";
    this.startedAt = Date.now();
  }

  markCompleted(result: TOutput): void {
    this.status = "completed";
    this.completedAt = Date.now();
    this.durationMs = this.startedAt ? this.completedAt - this.startedAt : 0;
    this.result = result;
    this.cleanupSignal();
  }

  markFailed(error: unknown): RuntimeError {
    this.status = "failed";
    this.completedAt = Date.now();
    this.durationMs = this.startedAt ? this.completedAt - this.startedAt : 0;

    const runtimeErr = RuntimeError.from(error, {
      taskId: this.taskId,
      executionId: this.executionId,
      executor: this.executorType,
      retryCount: this.retryCount,
    });
    this.error = runtimeErr;
    this.cleanupSignal();
    return runtimeErr;
  }

  markTimedOut(timeoutMs: number): RuntimeError {
    this.status = "timed_out";
    this.completedAt = Date.now();
    this.durationMs = this.startedAt ? this.completedAt - this.startedAt : timeoutMs;

    const runtimeErr = RuntimeError.timeout(timeoutMs, {
      taskId: this.taskId,
      executionId: this.executionId,
      executor: this.executorType,
      retryCount: this.retryCount,
    });
    this.error = runtimeErr;
    this.abortController.abort(runtimeErr);
    this.cleanupSignal();
    return runtimeErr;
  }

  markCancelled(reason?: string): RuntimeError {
    this.status = "cancelled";
    this.completedAt = Date.now();
    this.durationMs = this.startedAt ? this.completedAt - this.startedAt : 0;

    const runtimeErr = RuntimeError.cancelled(reason, {
      taskId: this.taskId,
      executionId: this.executionId,
      executor: this.executorType,
      retryCount: this.retryCount,
    });
    this.error = runtimeErr;
    this.abortController.abort(reason ?? "Task cancelled");
    this.cleanupSignal();
    return runtimeErr;
  }

  abort(reason?: string): void {
    if (this.status === "completed" || this.status === "failed") {
      return;
    }
    this.markCancelled(reason);
  }

  /**
   * Create a new execution context for retrying the task.
   */
  nextAttempt(): ExecutionContext<TInput, TOutput> {
    return new ExecutionContext<TInput, TOutput>({
      taskId: this.taskId,
      taskName: this.taskName,
      input: this.input,
      options: this.options,
      executorType: this.executorType,
      priority: this.priority,
      retryCount: this.retryCount + 1,
    });
  }

  private cleanupSignal(): void {
    if (this.userSignalCleanup) {
      this.userSignalCleanup();
      this.userSignalCleanup = undefined;
    }
  }
}
