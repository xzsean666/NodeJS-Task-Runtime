/**
 * ThreadExecutor implementation using Worker Threads and WorkerPool.
 */

import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Executor, ExecutorStats } from "../../core/executor.js";
import type { ExecutionContext } from "../../core/execution.js";
import { WorkerPool } from "./pool.js";
import type { WorkerPoolOptions } from "./types.js";
import type { RuntimeEventEmitter } from "../../observability/events.js";

export class ThreadExecutor implements Executor {
  readonly type = "thread" as const;
  private readonly pool: WorkerPool;

  constructor(options: WorkerPoolOptions = {}, eventEmitter?: RuntimeEventEmitter) {
    this.pool = new WorkerPool(options, eventEmitter);
  }

  resize(newSize: number): void {
    this.pool.resize(newSize);
  }

  async execute<TInput, TOutput>(context: ExecutionContext<TInput, TOutput>): Promise<TOutput> {
    const fn = (context as any).handler ?? context.options.metadata?.fn;
    let modulePath = context.options.metadata?.modulePath as string | undefined;
    const exportName = context.options.metadata?.exportName as string | undefined;

    if (modulePath && typeof modulePath === "string") {
      try {
        if (path.isAbsolute(modulePath)) {
          modulePath = pathToFileURL(modulePath).href;
        } else if (modulePath.startsWith(".") || modulePath.startsWith("/")) {
          modulePath = pathToFileURL(path.resolve(context.options.cwd ?? process.cwd(), modulePath)).href;
        }
      } catch {
        // Use raw modulePath if URL resolution fails
      }
    }

    const onAbort = () => {
      this.pool.terminateExecution(
        context.executionId,
        context.signal.reason ? String(context.signal.reason) : "Task aborted"
      );
    };

    if (context.signal) {
      context.signal.addEventListener("abort", onAbort, { once: true });
    }

    try {
      const result = await this.pool.execute(
        {
          executionId: context.executionId,
          fn,
          modulePath,
          exportName,
          input: context.input,
        },
        context.signal
      );
      return result as TOutput;
    } finally {
      if (context.signal) {
        context.signal.removeEventListener("abort", onAbort);
      }
    }
  }

  async terminate(executionId: string, reason?: string): Promise<void> {
    await this.pool.terminateExecution(executionId, reason);
  }

  stats(): ExecutorStats {
    return {
      active: this.pool.activeWorkers,
      idle: this.pool.idleWorkers,
      total: this.pool.totalWorkers,
    };
  }

  async destroy(): Promise<void> {
    await this.pool.destroy();
  }
}
