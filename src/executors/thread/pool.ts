/**
 * Worker Pool managing worker thread life cycles, dispatching, crash recovery and auto healing.
 */

import { Worker } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import { resolveWorkerCount } from "../../resource/cpu.js";
import { WORKER_RUNTIME_CODE } from "./worker-runtime.js";
import type {
  WorkerInboundMessage,
  WorkerOutboundMessage,
  WorkerPoolOptions,
  WorkerExecutionPayload,
} from "./types.js";
import type { RuntimeEventEmitter } from "../../observability/events.js";
import { RuntimeError } from "../../execution/error.js";

interface PooledWorker {
  id: string;
  worker: Worker;
  busy: boolean;
  currentExecutionId?: string;
  currentResolve?: (result: unknown) => void;
  currentReject?: (error: unknown) => void;
}

interface PendingExecution {
  payload: WorkerExecutionPayload;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal;
}

export class WorkerPool {
  private targetSize: number;
  private readonly options: WorkerPoolOptions;
  private readonly eventEmitter?: RuntimeEventEmitter;
  private readonly workers = new Map<string, PooledWorker>();
  private readonly waitQueue: PendingExecution[] = [];
  private isDestroyed = false;
  private isStarted = false;

  constructor(options: WorkerPoolOptions = {}, eventEmitter?: RuntimeEventEmitter) {
    this.options = options;
    this.targetSize = resolveWorkerCount(options.size);
    this.eventEmitter = eventEmitter;
  }

  get size(): number {
    return this.targetSize;
  }

  /**
   * Dynamically resizes the worker pool size.
   */
  resize(newSize: number): void {
    if (this.isDestroyed) return;
    const validated = Math.max(1, Math.floor(newSize));
    this.targetSize = validated;

    if (!this.isStarted) return;

    // Scale up
    while (this.workers.size < this.targetSize) {
      this.spawnWorker();
    }

    // Scale down if necessary: terminate idle workers first
    if (this.workers.size > this.targetSize) {
      for (const [id, pw] of this.workers.entries()) {
        if (this.workers.size <= this.targetSize) break;
        if (!pw.busy) {
          this.workers.delete(id);
          pw.worker.terminate().catch(() => {});
        }
      }
    }
  }

  get totalWorkers(): number {
    return this.workers.size;
  }

  get activeWorkers(): number {
    let count = 0;
    for (const w of this.workers.values()) {
      if (w.busy) count++;
    }
    return count;
  }

  get idleWorkers(): number {
    return this.totalWorkers - this.activeWorkers;
  }

  get queuedExecutions(): number {
    return this.waitQueue.length;
  }

  start(): void {
    if (this.isStarted || this.isDestroyed) return;
    this.isStarted = true;

    for (let i = 0; i < this.targetSize; i++) {
      this.spawnWorker();
    }
  }

  async execute(payload: WorkerExecutionPayload, signal?: AbortSignal): Promise<unknown> {
    if (this.isDestroyed) {
      throw RuntimeError.runtimeStopped("Worker pool is destroyed");
    }

    if (!this.isStarted) {
      this.start();
    }

    return new Promise((resolve, reject) => {
      const pending: PendingExecution = {
        payload,
        resolve,
        reject,
        signal,
      };

      if (signal?.aborted) {
        reject(RuntimeError.cancelled(String(signal.reason ?? "Aborted before dispatch")));
        return;
      }

      this.waitQueue.push(pending);
      this.drainQueue();
    });
  }

  async terminateExecution(executionId: string, reason = "Terminated by request"): Promise<void> {
    for (const [id, pw] of this.workers.entries()) {
      if (pw.currentExecutionId === executionId) {
        const reject = pw.currentReject;
        const worker = pw.worker;
        this.resetWorkerState(pw);
        this.workers.delete(id);

        if (reject) {
          reject(RuntimeError.cancelled(reason, { executionId, executor: "thread" }));
        }

        try {
          await worker.terminate();
        } catch {
          // ignore
        }

        // Auto healing: spawn replacement
        if (!this.isDestroyed && this.workers.size < this.targetSize) {
          this.spawnWorker();
        }
        return;
      }
    }

    // Also remove from waitQueue if it's still waiting
    const idx = this.waitQueue.findIndex((p) => p.payload.executionId === executionId);
    if (idx !== -1) {
      const pending = this.waitQueue.splice(idx, 1)[0];
      pending.reject(RuntimeError.cancelled(reason, { executionId, executor: "thread" }));
    }
  }

  async destroy(): Promise<void> {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    // Reject all queued executions
    while (this.waitQueue.length > 0) {
      const pending = this.waitQueue.shift()!;
      pending.reject(RuntimeError.runtimeStopped("Worker pool destroyed"));
    }

    // Terminate all workers
    const terminations: Promise<number>[] = [];
    for (const pw of this.workers.values()) {
      const reject = pw.currentReject;
      this.resetWorkerState(pw);
      if (reject) {
        reject(RuntimeError.runtimeStopped("Worker pool destroyed"));
      }
      terminations.push(pw.worker.terminate());
    }

    this.workers.clear();
    await Promise.allSettled(terminations);
  }

  private spawnWorker(): void {
    if (this.isDestroyed) return;

    const workerId = `worker_${randomUUID().slice(0, 8)}`;
    const workerOptions: {
      eval: boolean;
      resourceLimits?: { maxOldGenerationSizeMb?: number };
    } = { eval: true };

    if (this.options.resource?.maxMemoryMb) {
      workerOptions.resourceLimits = {
        maxOldGenerationSizeMb: this.options.resource.maxMemoryMb,
      };
    }

    let worker: Worker;
    try {
      worker = new Worker(WORKER_RUNTIME_CODE, workerOptions);
    } catch (err: any) {
      this.eventEmitter?.emit("worker:crash", {
        workerId,
        error: err instanceof Error ? err : new Error(String(err)),
      });
      return;
    }

    const pooled: PooledWorker = {
      id: workerId,
      worker,
      busy: false,
    };

    this.workers.set(workerId, pooled);
    this.eventEmitter?.emit("worker:spawn", { workerId, type: "thread" });

    worker.on("message", (msg: WorkerOutboundMessage) => {
      this.handleWorkerMessage(pooled, msg);
    });

    worker.on("error", (err: Error) => {
      this.handleWorkerCrash(pooled, err);
    });

    worker.on("exit", (exitCode: number) => {
      this.handleWorkerExit(pooled, exitCode);
    });
  }

  private handleWorkerMessage(pooled: PooledWorker, msg: WorkerOutboundMessage): void {
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "READY") {
      if (!pooled.busy) {
        this.drainQueue();
      }
      return;
    }

    if (msg.type === "SUCCESS" && pooled.currentExecutionId === msg.executionId) {
      const resolve = pooled.currentResolve;
      this.resetWorkerState(pooled);
      if (resolve) {
        resolve(msg.result);
      }
      this.drainQueue();
      return;
    }

    if (msg.type === "ERROR" && pooled.currentExecutionId === msg.executionId) {
      const reject = pooled.currentReject;
      this.resetWorkerState(pooled);
      if (reject) {
        const err = new Error(msg.error.message);
        err.name = msg.error.name || "Error";
        if (msg.error.stack) err.stack = msg.error.stack;
        reject(err);
      }
      this.drainQueue();
      return;
    }
  }

  private handleWorkerCrash(pooled: PooledWorker, err: Error): void {
    this.eventEmitter?.emit("worker:crash", {
      workerId: pooled.id,
      error: err,
    });

    const reject = pooled.currentReject;
    const executionId = pooled.currentExecutionId;
    this.resetWorkerState(pooled);
    this.workers.delete(pooled.id);

    try {
      pooled.worker.terminate().catch(() => {});
    } catch {}

    if (reject) {
      reject(
        RuntimeError.workerCrashed(err.message, {
          executionId,
          executor: "thread",
          cause: err,
        })
      );
    }

    if (!this.isDestroyed && this.workers.size < this.targetSize) {
      this.spawnWorker();
    }
  }

  private handleWorkerExit(pooled: PooledWorker, exitCode: number): void {
    this.eventEmitter?.emit("worker:exit", {
      workerId: pooled.id,
      code: exitCode,
      signal: null,
    });

    if (pooled.busy && pooled.currentReject) {
      pooled.currentReject(
        RuntimeError.workerCrashed(`Worker exited unexpectedly with code ${exitCode}`, {
          executionId: pooled.currentExecutionId,
          executor: "thread",
          exitCode,
        })
      );
    }

    this.workers.delete(pooled.id);

    // Auto healing: spawn a replacement worker if pool is still active
    if (!this.isDestroyed && this.workers.size < this.targetSize) {
      this.spawnWorker();
    }
  }

  private resetWorkerState(pooled: PooledWorker): void {
    pooled.busy = false;
    pooled.currentExecutionId = undefined;
    pooled.currentResolve = undefined;
    pooled.currentReject = undefined;
  }

  private drainQueue(): void {
    if (this.isDestroyed || this.waitQueue.length === 0) return;

    for (const pooled of this.workers.values()) {
      if (this.waitQueue.length === 0) break;
      if (pooled.busy) continue;

      const pending = this.waitQueue.shift()!;
      if (pending.signal?.aborted) {
        pending.reject(
          RuntimeError.cancelled(String(pending.signal.reason ?? "Aborted before dispatch"), {
            executionId: pending.payload.executionId,
            executor: "thread",
          })
        );
        continue;
      }

      pooled.busy = true;
      pooled.currentExecutionId = pending.payload.executionId;
      pooled.currentResolve = pending.resolve;
      pooled.currentReject = pending.reject;

      const fn = pending.payload.fn;
      const fnCode = typeof fn === "function" ? fn.toString() : typeof fn === "string" ? fn : undefined;

      const message: WorkerInboundMessage = {
        type: "EXECUTE",
        executionId: pending.payload.executionId,
        fnCode,
        modulePath: pending.payload.modulePath,
        exportName: pending.payload.exportName,
        input: pending.payload.input,
      };

      pooled.worker.postMessage(message);
    }
  }
}
