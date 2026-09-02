/**
 * Node.js Task Runtime SDK
 *
 * A unified, high-performance Task Execution Runtime for Node.js.
 */

export const VERSION = "0.1.0";

// API Entrypoints
export { createRuntime } from "./api/runtime.js";
export { TaskRuntime } from "./core/runtime.js";
export type { TaskCallable } from "./core/task.js";
export { createTaskCallable } from "./core/task.js";

// Core Types
export type {
  LifecycleState,
  ExecutionStatus,
  ExecutorType,
  DataFormat,
  BackoffStrategy,
  RetryOptions,
  TaskOptions,
  CliTaskOptions,
  TaskHandler,
  RuntimeOptions,
  RuntimeStats,
} from "./core/types.js";

// Execution Context & Contract
export { ExecutionContext } from "./core/execution.js";
export type { ExecutionContextOptions } from "./core/execution.js";
export type { Executor, ExecutorStats } from "./core/executor.js";
export { LifecycleManager } from "./core/lifecycle.js";

// Error System
export { RuntimeError, RuntimeErrorCode } from "./execution/error.js";
export type { RuntimeErrorOptions } from "./execution/error.js";

// Execution Controls
export { withTimeout } from "./execution/timeout.js";
export {
  withRetry,
  calculateBackoffDelay,
  normalizeRetryOptions,
} from "./execution/retry.js";
export { createLinkedAbortController } from "./execution/cancellation.js";

// Resource Management
export { getAutoWorkerCount, resolveWorkerCount } from "./resource/cpu.js";
export { parseMemoryLimit, toNodeMaxOldSpaceSizeArg } from "./resource/memory.js";
export { normalizeResourceLimits } from "./resource/limits.js";
export type { ResourceLimits } from "./resource/limits.js";

// Schedulers & Queues
export { TaskScheduler } from "./scheduler/scheduler.js";
export { PriorityQueue } from "./scheduler/priority-queue.js";
export { ConcurrencyLimiter } from "./scheduler/concurrency.js";
export type { Queue } from "./scheduler/queue.js";

// Observability & Events
export {
  RuntimeEventEmitter,
  type RuntimeEventMap,
  type RuntimeEventName,
  type RuntimeEventListener,
} from "./observability/events.js";
export { MetricsCollector } from "./observability/metrics.js";
export {
  ConsoleLogger,
  NoopLogger,
  defaultLogger,
  type Logger,
  type LogLevel,
} from "./observability/logger.js";

// Executors
export { ThreadExecutor } from "./executors/thread/executor.js";
export { WorkerPool } from "./executors/thread/pool.js";
export { ProcessExecutor } from "./executors/process/executor.js";
export { CLIExecutor } from "./executors/cli/executor.js";

// Transport Protocols
export { serializeJson, parseJson } from "./transport/json.js";
export { toBuffer } from "./transport/binary.js";
export { writeToStdin, formatOutput } from "./transport/protocol.js";
