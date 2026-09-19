import { describe, it, expect, vi } from "vitest";
import {
  RuntimeError,
  RuntimeErrorCode,
  ExecutionContext,
  LifecycleManager,
  WorkerPool,
  TaskScheduler,
  createTaskCallable,
} from "../../src/index.js";

describe("v2-reliability-optimizations", () => {
  describe("ExecutionContext.nextAttempt() progress preservation", () => {
    it("should preserve onProgress callback across retry attempts", () => {
      const progressCalls: any[] = [];
      const ctx = new ExecutionContext({
        input: 42,
        onProgress: (e) => progressCalls.push(e),
      });

      ctx.reportProgress(50, "halfway");
      expect(progressCalls.length).toBe(1);
      expect(progressCalls[0].progress).toBe(50);

      const nextCtx = ctx.nextAttempt();
      expect(nextCtx.retryCount).toBe(1);
      nextCtx.reportProgress(75, "almost done");
      expect(progressCalls.length).toBe(2);
      expect(progressCalls[1].progress).toBe(75);
    });
  });

  describe("LifecycleManager draining state guard", () => {
    it("should throw RUNTIME_DRAINING if start() is called while draining", async () => {
      const lm = new LifecycleManager();
      lm.start();
      expect(lm.isRunning).toBe(true);

      const dummyCtx = new ExecutionContext({ input: 1 });
      lm.registerExecution(dummyCtx);

      const shutdownPromise = lm.shutdown(200);
      expect(lm.isDraining).toBe(true);

      expect(() => lm.start()).toThrowError();
      try {
        lm.start();
      } catch (err: any) {
        expect(RuntimeError.isRuntimeError(err)).toBe(true);
        expect(err.code).toBe(RuntimeErrorCode.RUNTIME_DRAINING);
      }

      lm.unregisterExecution(dummyCtx);
      await shutdownPromise;
      expect(lm.isStopped).toBe(true);
    });
  });

  describe("TaskCallable.batch early-exit on error", () => {
    it("should not pick up remaining unstarted items when an item fails in concurrency limited batch", async () => {
      const executedIndices: number[] = [];

      const failTask = createTaskCallable(
        async (input: { id: number; fail: boolean }) => {
          executedIndices.push(input.id);
          if (input.fail) {
            throw new Error(`Intentional failure at ${input.id}`);
          }
          await new Promise((r) => setTimeout(r, 20));
          return input.id;
        },
        { name: "fail-batch" }
      );

      const items = [
        { id: 0, fail: false },
        { id: 1, fail: true }, // fails immediately
        { id: 2, fail: false },
        { id: 3, fail: false },
        { id: 4, fail: false },
        { id: 5, fail: false },
      ];

      await expect(
        failTask.batch(items, { batchConcurrency: 1 })
      ).rejects.toThrow("Intentional failure at 1");

      // With batchConcurrency 1, item 0 and item 1 run. Item 1 fails, so items 2, 3, 4, 5 should NOT be executed!
      expect(executedIndices).toEqual([0, 1]);
    });
  });

  describe("WorkerPool readyWorkers synchronization & cleanup", () => {
    it("should remove worker from readyWorkers on resize down and terminate", async () => {
      const pool = new WorkerPool({ size: 3 });
      await pool.warmup();
      expect(pool.totalWorkers).toBe(3);

      // Scale down to 1
      pool.resize(1);
      expect(pool.totalWorkers).toBe(1);

      // Terminate execution should also clean up
      await pool.destroy();
      expect(pool.totalWorkers).toBe(0);
    });

    it("should fast-abort pending execution while queued in WorkerPool waitQueue", async () => {
      const pool = new WorkerPool({ size: 1 });
      await pool.warmup();

      // Occupy the 1 worker
      const longTask = pool.execute({
        executionId: "exec_1",
        fn: async () => {
          await new Promise((r) => setTimeout(r, 100));
          return "done";
        },
        input: null,
      });

      // Queue a second task with AbortController
      const ac = new AbortController();
      const waitingTask = pool.execute(
        {
          executionId: "exec_2",
          fn: () => "should-not-run",
          input: null,
        },
        ac.signal
      );

      expect(pool.queuedExecutions).toBe(1);

      // Abort the waiting task before worker is free
      ac.abort("User cancelled queue item");

      await expect(waitingTask).rejects.toThrow("User cancelled queue item");
      expect(pool.queuedExecutions).toBe(0);

      await longTask;
      await pool.destroy();
    });
  });

  describe("TaskScheduler.clear() signal cleanup & idle notification", () => {
    it("should clean up signal listeners and notify idle when cleared", async () => {
      const scheduler = new TaskScheduler({ maxConcurrency: 1 });
      const ac = new AbortController();

      let finishTask1: (() => void) | undefined;
      const mockExecutor = {
        type: "thread" as const,
        execute: vi.fn().mockImplementation(
          () => new Promise<void>((resolve) => { finishTask1 = resolve; })
        ),
        terminate: vi.fn(),
        stats: vi.fn().mockReturnValue({ active: 0 }),
        destroy: vi.fn(),
      };

      // Task 1 runs immediately and occupies the single concurrency slot
      const ctx1 = new ExecutionContext({ input: "task1" });
      const p1 = scheduler.submit(ctx1, mockExecutor);

      // Task 2 is queued because maxConcurrency is 1
      const ctx2 = new ExecutionContext({
        input: "task2",
        options: { signal: ac.signal },
      });
      const p2 = scheduler.submit(ctx2, mockExecutor);

      expect(scheduler.pendingCount).toBe(1);

      // Now clear scheduler - task 2 should be rejected and dequeued
      scheduler.clear("Clearing for test");
      expect(scheduler.pendingCount).toBe(0);

      await expect(p2).rejects.toThrow("Clearing for test");

      // Complete task 1
      finishTask1?.();
      await p1;

      // onIdle should resolve immediately because pending is 0 and active is 0
      await expect(scheduler.onIdle()).resolves.toBeUndefined();
    });
  });
});
