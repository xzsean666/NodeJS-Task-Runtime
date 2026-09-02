/**
 * Executor abstract contract and interface.
 */

import type { ExecutorType } from "./types.js";
import type { ExecutionContext } from "./execution.js";

export interface ExecutorStats {
  active: number;
  idle?: number;
  total?: number;
}

export interface Executor {
  readonly type: ExecutorType;

  /**
   * Execute a task within the given execution context.
   */
  execute<TInput, TOutput>(context: ExecutionContext<TInput, TOutput>): Promise<TOutput>;

  /**
   * Terminate a specific running execution.
   */
  terminate(executionId: string, reason?: string): Promise<void>;

  /**
   * Query the executor's internal stats (e.g. pool capacity).
   */
  stats?(): ExecutorStats;

  /**
   * Gracefully destroy and release all resources held by this executor.
   */
  destroy(): Promise<void>;
}
