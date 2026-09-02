/**
 * Core type definitions for Node.js Task Runtime SDK
 */

import type { Logger } from "../observability/logger.js";
import type { ResourceLimits } from "../resource/limits.js";
import type { RuntimeError } from "../execution/error.js";

/**
 * Lifecycle state of the runtime.
 */
export type LifecycleState = "created" | "running" | "draining" | "stopped";

/**
 * Execution status for individual tasks.
 */
export type ExecutionStatus =
  | "pending"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out";

/**
 * Executor backend type.
 */
export type ExecutorType = "thread" | "process" | "cli";

/**
 * Data format for process/CLI stdin/stdout.
 */
export type DataFormat = "json" | "string" | "binary" | "inherit" | "ignore";

/**
 * Retry backoff strategies.
 */
export type BackoffStrategy = "fixed" | "linear" | "exponential";

/**
 * Detailed retry options.
 */
export interface RetryOptions {
  /**
   * Maximum number of execution attempts (including the initial attempt).
   * For example, attempts: 3 means 1 initial run + up to 2 retries.
   */
  attempts: number;

  /**
   * Backoff strategy: 'fixed', 'linear', or 'exponential'. Default: 'exponential'.
   */
  backoff?: BackoffStrategy;

  /**
   * Base delay in milliseconds between retries. Default: 100ms.
   */
  delay?: number;

  /**
   * Maximum delay in milliseconds between retries. Default: 30000ms (30s).
   */
  maxDelay?: number;

  /**
   * Optional predicate to decide whether a given error should trigger a retry.
   */
  retryIf?: (error: RuntimeError) => boolean;
}

/**
 * Task execution configuration options.
 */
export interface TaskOptions<TInput = unknown> {
  /**
   * Optional custom task ID for distributed tracing and tracking.
   */
  taskId?: string;

  /**
   * Human-readable task name.
   */
  name?: string;

  /**
   * Numeric priority. Higher numbers run first. Default: 0.
   */
  priority?: number;

  /**
   * Maximum concurrent executions for this specific task. Default: unlimited (bounded by global concurrency).
   */
  concurrency?: number;

  /**
   * Execution timeout in milliseconds. Default: 0 (no timeout).
   */
  timeout?: number;

  /**
   * Retry configuration: number of attempts or full RetryOptions.
   */
  retry?: number | RetryOptions;

  /**
   * Preferred executor backend.
   */
  executor?: ExecutorType;

  /**
   * Resource constraints (e.g. max memory limit).
   */
  resource?: ResourceLimits;

  /**
   * Working directory for CLI / Process execution.
   */
  cwd?: string;

  /**
   * Environment variables for CLI / Process execution.
   */
  env?: Record<string, string>;

  /**
   * External AbortSignal for task cancellation.
   */
  signal?: AbortSignal;

  /**
   * CLI argument builder or static arguments.
   */
  args?: string[] | ((input: TInput) => string[]);

  /**
   * Standard input data protocol.
   */
  stdin?: "json" | "string" | "binary" | "pipe";

  /**
   * Standard output data protocol.
   */
  stdout?: DataFormat;

  /**
   * Standard error data protocol.
   */
  stderr?: DataFormat;

  /**
   * Custom metadata attached to task.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Task function signature.
 */
export type TaskHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput
) => Promise<TOutput> | TOutput;

/**
 * CLI Task definition options.
 */
export interface CliTaskOptions<TInput = unknown>
  extends Omit<TaskOptions<TInput>, "executor"> {
  /**
   * The command or binary path to execute.
   */
  command: string;
}

/**
 * Task runtime global options.
 */
export interface RuntimeOptions {
  /**
   * Number of worker threads, or 'auto' to adapt to CPU cores. Default: 'auto'.
   */
  workers?: number | "auto";

  /**
   * Maximum global concurrency across all tasks. Default: 0 (unlimited / pool size bounded).
   */
  maxConcurrency?: number;

  /**
   * Global default timeout in milliseconds. Default: 0 (no timeout).
   */
  defaultTimeout?: number;

  /**
   * Global default retry configuration.
   */
  defaultRetry?: number | RetryOptions;

  /**
   * Global default executor backend. Default: 'thread'.
   */
  defaultExecutor?: ExecutorType;

  /**
   * Logger adapter.
   */
  logger?: Logger;

  /**
   * Graceful shutdown timeout in milliseconds. Default: 10000ms.
   */
  shutdownTimeout?: number;
}

/**
 * Task runtime metrics and statistics.
 */
export interface RuntimeStats {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  cancelledTasks: number;
  timedOutTasks: number;
  retriedTasks: number;
  activeExecutions: number;
  queuedTasks: number;
  activeWorkers: number;
  idleWorkers: number;
  totalWorkers: number;
  averageDurationMs: number;
}
