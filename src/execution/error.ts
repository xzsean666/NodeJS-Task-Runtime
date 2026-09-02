/**
 * Unified RuntimeError exception system.
 */

import type { ExecutorType } from "../core/types.js";

export const RuntimeErrorCode = {
  TASK_TIMEOUT: "TASK_TIMEOUT",
  TASK_CANCELLED: "TASK_CANCELLED",
  TASK_EXECUTION_FAILED: "TASK_EXECUTION_FAILED",
  WORKER_CRASHED: "WORKER_CRASHED",
  WORKER_ERROR: "WORKER_ERROR",
  PROCESS_FAILED: "PROCESS_FAILED",
  PROCESS_CRASHED: "PROCESS_CRASHED",
  RUNTIME_STOPPED: "RUNTIME_STOPPED",
  RUNTIME_DRAINING: "RUNTIME_DRAINING",
  QUEUE_FULL: "QUEUE_FULL",
  INVALID_ARGUMENT: "INVALID_ARGUMENT",
  SERIALIZATION_ERROR: "SERIALIZATION_ERROR",
} as const;

export type RuntimeErrorCode =
  (typeof RuntimeErrorCode)[keyof typeof RuntimeErrorCode];

export interface RuntimeErrorOptions {
  code: RuntimeErrorCode | string;
  message: string;
  taskId?: string;
  executionId?: string;
  executor?: ExecutorType;
  exitCode?: number | null;
  signal?: NodeJS.Signals | string | null;
  timeout?: boolean;
  cancelled?: boolean;
  retryCount?: number;
  stderr?: string;
  cause?: unknown;
}

export class RuntimeError extends Error {
  readonly code: string;
  readonly taskId?: string;
  readonly executionId?: string;
  readonly executor?: ExecutorType;
  readonly exitCode?: number | null;
  readonly signal?: string | null;
  readonly timeout: boolean;
  readonly cancelled: boolean;
  readonly retryCount: number;
  readonly stderr?: string;
  readonly timestamp: number;

  constructor(options: RuntimeErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "RuntimeError";
    this.code = options.code;
    this.taskId = options.taskId;
    this.executionId = options.executionId;
    this.executor = options.executor;
    this.exitCode = options.exitCode ?? null;
    this.signal = options.signal ?? null;
    this.timeout = Boolean(options.timeout);
    this.cancelled = Boolean(options.cancelled);
    this.retryCount = options.retryCount ?? 0;
    this.stderr = options.stderr;
    this.timestamp = Date.now();

    // Preserve prototype chain
    Object.setPrototypeOf(this, RuntimeError.prototype);
  }

  /**
   * Check if a given object is a RuntimeError.
   */
  static isRuntimeError(error: unknown): error is RuntimeError {
    return error instanceof RuntimeError || (error instanceof Error && error.name === "RuntimeError");
  }

  /**
   * Create a RuntimeError from any unknown error, attaching execution context.
   */
  static from(error: unknown, context?: Partial<RuntimeErrorOptions>): RuntimeError {
    if (error instanceof RuntimeError) {
      if (!context) return error;
      return new RuntimeError({
        code: context.code ?? error.code,
        message: context.message ?? error.message,
        taskId: context.taskId ?? error.taskId,
        executionId: context.executionId ?? error.executionId,
        executor: context.executor ?? error.executor,
        exitCode: context.exitCode !== undefined ? context.exitCode : error.exitCode,
        signal: context.signal !== undefined ? context.signal : error.signal,
        timeout: context.timeout !== undefined ? context.timeout : error.timeout,
        cancelled: context.cancelled !== undefined ? context.cancelled : error.cancelled,
        retryCount: context.retryCount !== undefined ? context.retryCount : error.retryCount,
        stderr: context.stderr ?? error.stderr,
        cause: context.cause ?? error.cause ?? error,
      });
    }

    const message = error instanceof Error ? error.message : String(error);
    return new RuntimeError({
      code: context?.code ?? RuntimeErrorCode.TASK_EXECUTION_FAILED,
      message,
      taskId: context?.taskId,
      executionId: context?.executionId,
      executor: context?.executor,
      exitCode: context?.exitCode,
      signal: context?.signal,
      timeout: context?.timeout,
      cancelled: context?.cancelled,
      retryCount: context?.retryCount,
      stderr: context?.stderr,
      cause: error,
    });
  }

  /**
   * Create a task timeout error.
   */
  static timeout(timeoutMs: number, context?: Partial<RuntimeErrorOptions>): RuntimeError {
    return new RuntimeError({
      code: RuntimeErrorCode.TASK_TIMEOUT,
      message: `Task timed out after ${timeoutMs}ms`,
      timeout: true,
      ...context,
    });
  }

  /**
   * Create a task cancelled error.
   */
  static cancelled(reason?: string, context?: Partial<RuntimeErrorOptions>): RuntimeError {
    return new RuntimeError({
      code: RuntimeErrorCode.TASK_CANCELLED,
      message: reason ? `Task cancelled: ${reason}` : "Task was cancelled",
      cancelled: true,
      ...context,
    });
  }

  /**
   * Create a worker crash error.
   */
  static workerCrashed(message: string, context?: Partial<RuntimeErrorOptions>): RuntimeError {
    return new RuntimeError({
      code: RuntimeErrorCode.WORKER_CRASHED,
      message: `Worker thread crashed: ${message}`,
      executor: "thread",
      ...context,
    });
  }

  /**
   * Create a child process failure error.
   */
  static processFailed(
    exitCode: number | null,
    signal: string | null,
    stderr?: string,
    context?: Partial<RuntimeErrorOptions>
  ): RuntimeError {
    const details = signal
      ? `killed with signal ${signal}`
      : `exited with code ${exitCode}`;
    const errMsg = `Process ${details}${stderr ? `:\n${stderr}` : ""}`;
    return new RuntimeError({
      code: RuntimeErrorCode.PROCESS_FAILED,
      message: errMsg,
      executor: context?.executor ?? "process",
      exitCode,
      signal,
      stderr,
      ...context,
    });
  }

  /**
   * Create a runtime stopped error.
   */
  static runtimeStopped(message = "Runtime is stopped or draining"): RuntimeError {
    return new RuntimeError({
      code: RuntimeErrorCode.RUNTIME_STOPPED,
      message,
    });
  }

  /**
   * Formatted JSON representation.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      taskId: this.taskId,
      executionId: this.executionId,
      executor: this.executor,
      exitCode: this.exitCode,
      signal: this.signal,
      timeout: this.timeout,
      cancelled: this.cancelled,
      retryCount: this.retryCount,
      stderr: this.stderr,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}
