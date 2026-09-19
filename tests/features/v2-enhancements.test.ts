import { describe, it, expect, vi } from "vitest";
import {
  createRuntime,
  calculateBackoffDelay,
  withTimeout,
  PriorityQueue,
} from "../../src/index.js";

describe("v0.2.0 Enhancements and Audit Fixes", () => {
  describe("Audit Fix 1: Scheduler Promise Settled on Abort / Cancellation", () => {
    it("should reject and never hang when signal is aborted while executing", async () => {
      const runtime = createRuntime({ workers: 1 });
      const controller = new AbortController();

      const longTask = runtime.task(
        async () => {
          await new Promise((r) => setTimeout(r, 100));
          return "finished";
        },
        { name: "abortable-task" }
      );

      const promise = longTask(undefined, { signal: controller.signal });
      setTimeout(() => controller.abort("user abort"), 10);

      await expect(promise).rejects.toThrow();
      await runtime.shutdown();
    });
  });

  describe("Audit Fix 2: withTimeout does not cause unhandledRejection", () => {
    it("should safely suppress late rejections from timed-out actions", async () => {
      let lateErrorThrown = false;
      process.once("unhandledRejection", () => {
        lateErrorThrown = true;
      });

      const delayedAction = async () => {
        await new Promise((r) => setTimeout(r, 50));
        throw new Error("Late failure after timeout");
      };

      await expect(
        withTimeout(delayedAction, {
          timeoutMs: 10,
          taskId: "test-timeout",
        })
      ).rejects.toThrow(/timed out/i);

      // Wait past the delayed action duration
      await new Promise((r) => setTimeout(r, 100));
      expect(lateErrorThrown).toBe(false);
    });
  });

  describe("Audit Fix 3 & 4: PriorityQueue dequeueMatching", () => {
    it("should correctly find and dequeue highest priority matching item", () => {
      const pq = new PriorityQueue<{ id: string; category: string }>();
      pq.enqueue({ id: "1", category: "A" }, 10);
      pq.enqueue({ id: "2", category: "B" }, 20);
      pq.enqueue({ id: "3", category: "B" }, 30);
      pq.enqueue({ id: "4", category: "A" }, 40);

      // Match category "B" - should return id "3" (priority 30) first
      const item1 = pq.dequeueMatching((i) => i.category === "B");
      expect(item1?.id).toBe("3");

      // Match category "B" again - should return id "2" (priority 20)
      const item2 = pq.dequeueMatching((i) => i.category === "B");
      expect(item2?.id).toBe("2");

      // No more "B"
      const item3 = pq.dequeueMatching((i) => i.category === "B");
      expect(item3).toBeUndefined();

      // Top remaining is id "4" (priority 40)
      expect(pq.dequeue()?.id).toBe("4");
      expect(pq.dequeue()?.id).toBe("1");
    });
  });

  describe("Feature 1: Task Middleware System (runtime.use & task.middlewares)", () => {
    it("should execute global and task-level middlewares in onion model", async () => {
      const runtime = createRuntime({ workers: 1 });
      const order: string[] = [];

      // Global middleware
      runtime.use(async (ctx, next) => {
        order.push("global:start");
        const res = await next();
        order.push("global:end");
        return res;
      });

      // Task-level middleware
      const customTask = runtime.task(
        (x: number) => {
          return x * 2;
        },
        {
          name: "math-task",
          middlewares: [
            async (ctx, next) => {
              order.push("task:start");
              const res = await next();
              order.push("task:end");
              return res;
            },
          ],
        }
      );

      const result = await customTask(5);
      expect(result).toBe(10);
      expect(order).toEqual([
        "global:start",
        "task:start",
        "task:end",
        "global:end",
      ]);

      await runtime.shutdown();
    });
  });

  describe("Feature 2: Pipeline Chaining (runtime.pipeline & task.pipe)", () => {
    it("should pipe tasks and transfer output to input", async () => {
      const runtime = createRuntime({ workers: 1 });

      const step1 = runtime.task((x: number) => x + 1, { name: "step1" });
      const step2 = runtime.task((x: number) => x * 3, { name: "step2" });
      const step3 = (x: number) => `Result: ${x}`;

      // Test task.pipe
      const piped = step1.pipe(step2);
      const res1 = await piped(4); // (4 + 1) * 3 = 15
      expect(res1).toBe(15);

      // Test runtime.pipeline
      const pipeline = runtime.pipeline(step1, step2, step3);
      const res2 = await pipeline(4); // "Result: 15"
      expect(res2).toBe("Result: 15");

      await runtime.shutdown();
    });
  });

  describe("Feature 3: Batch Settled & Batch Concurrency", () => {
    it("should support batchSettled with mixed successes and failures", async () => {
      const runtime = createRuntime({ workers: 2 });

      const flakyTask = runtime.task(
        (n: number) => {
          if (n === 2) throw new Error("Number 2 failed");
          return n * 10;
        },
        { name: "flaky-task" }
      );

      const results = await flakyTask.batchSettled([1, 2, 3], {
        batchConcurrency: 2,
      });

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ status: "fulfilled", value: 10 });
      expect(results[1].status).toBe("rejected");
      if (results[1].status === "rejected") {
        expect(results[1].reason.message).toContain("Number 2 failed");
      }
      expect(results[2]).toEqual({ status: "fulfilled", value: 30 });

      await runtime.shutdown();
    });
  });

  describe("Feature 4: Progress Reporting", () => {
    it("should emit task:progress events and invoke reportProgress", async () => {
      const runtime = createRuntime({ workers: 1 });
      const progressEvents: number[] = [];

      runtime.on("task:progress", (e) => {
        progressEvents.push(e.progress);
      });

      const longTask = runtime.task(
        async function (this: any, items: number[]) {
          return items.length;
        },
        { name: "progress-task" }
      );

      // Simulate a task that uses context.reportProgress inside a custom middleware
      runtime.use(async (ctx, next) => {
        ctx.reportProgress(25, "Quarter way");
        ctx.reportProgress(50, "Half way");
        ctx.reportProgress(100, "Done");
        return next();
      });

      const res = await longTask([1, 2, 3]);
      expect(res).toBe(3);
      expect(progressEvents).toEqual([25, 50, 100]);

      await runtime.shutdown();
    });
  });

  describe("Feature 5: Full Jitter in Retry", () => {
    it("should calculate backoff delay within jitter range", () => {
      const delay = calculateBackoffDelay(3, {
        attempts: 3,
        delay: 100,
        maxDelay: 1000,
        backoff: "exponential",
        jitter: true,
      });

      // Exponential without jitter: 100 * 2^(3-1) = 400
      // With jitter: random between 0 and 400
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(400);
    });
  });

  describe("Feature 6: Backpressure & Queue Overflow Strategy", () => {
    it("should reject tasks when maxQueueSize is exceeded with 'reject' strategy", async () => {
      const runtime = createRuntime({
        workers: 1,
        maxConcurrency: 1,
        maxQueueSize: 2,
        overflowStrategy: "reject",
      });

      const slowTask = runtime.task(
        () => new Promise((r) => setTimeout(r, 100)),
        { name: "slow" }
      );

      // Task 1: starts running (active = 1)
      const p1 = slowTask();
      // Task 2: queued (queue size = 1)
      const p2 = slowTask();
      // Task 3: queued (queue size = 2)
      const p3 = slowTask();
      // Task 4: exceeds maxQueueSize (2) -> should immediately reject with QUEUE_FULL
      await expect(slowTask()).rejects.toThrow(/queue.*full|capacity/i);

      await Promise.all([p1, p2, p3]);
      await runtime.shutdown();
    });
  });

  describe("Feature 7: Worker Pool Resize", () => {
    it("should dynamically scale worker pool size", async () => {
      const runtime = createRuntime({ workers: 1 });
      const initTask = runtime.task((x: number) => x * 2);
      await initTask(1); // Start worker pool
      expect(runtime.stats().totalWorkers).toBe(1);

      runtime.resizeWorkers(4);
      expect(runtime.stats().totalWorkers).toBe(4);

      runtime.resizeWorkers(2);
      expect(runtime.stats().totalWorkers).toBeLessThanOrEqual(4);

      await runtime.shutdown();
    });
  });

  describe("Feature 8: Graceful Shutdown with complete queue drain", () => {
    it("should finish all queued tasks before shutting down", async () => {
      const runtime = createRuntime({ workers: 1, maxConcurrency: 1 });

      const work = runtime.task((n: number) => {
        return new Promise<number>((r) => setTimeout(() => r(n), 30));
      });

      const p1 = work(1);
      const p2 = work(2);
      const p3 = work(3);

      // Trigger shutdown while tasks 2 and 3 are still waiting in queue
      const shutdownPromise = runtime.shutdown();

      const results = await Promise.all([p1, p2, p3]);
      await shutdownPromise;

      expect(results).toEqual([1, 2, 3]);
    });
  });
});
