import { describe, it, expect, vi } from "vitest";
import { TaskScheduler } from "../../src/scheduler/scheduler.js";
import { ExecutionContext } from "../../src/core/execution.js";
import { RuntimeEventEmitter } from "../../src/observability/events.js";
import type { Executor } from "../../src/core/executor.js";

function createMockExecutor(delay = 10): Executor {
  return {
    type: "thread",
    async execute<TInput, TOutput>(context: ExecutionContext<TInput, TOutput>): Promise<TOutput> {
      if (delay > 0) {
        await new Promise((r) => setTimeout(r, delay));
      }
      if (context.input === "error") {
        throw new Error("Execution failed");
      }
      return (context.input as unknown) as TOutput;
    },
    async terminate(): Promise<void> {},
    async destroy(): Promise<void> {},
  };
}

describe("TaskScheduler", () => {
  it("should submit and execute tasks successfully", async () => {
    const events = new RuntimeEventEmitter();
    const queuedSpy = vi.fn();
    const completeSpy = vi.fn();

    events.on("task:queued", queuedSpy);
    events.on("task:complete", completeSpy);

    const scheduler = new TaskScheduler({ eventEmitter: events });
    const executor = createMockExecutor(5);

    const ctx = new ExecutionContext({ input: "hello" });
    const result = await scheduler.submit(ctx, executor);

    expect(result).toBe("hello");
    expect(ctx.status).toBe("completed");
    expect(queuedSpy).toHaveBeenCalledTimes(1);
    expect(completeSpy).toHaveBeenCalledTimes(1);
  });

  it("should handle task failure and propagate RuntimeError", async () => {
    const scheduler = new TaskScheduler();
    const executor = createMockExecutor(5);

    const ctx = new ExecutionContext({ input: "error" });
    await expect(scheduler.submit(ctx, executor)).rejects.toThrow("Execution failed");
    expect(ctx.status).toBe("failed");
  });

  it("should respect priority ordering when concurrency is restricted", async () => {
    const scheduler = new TaskScheduler({ maxConcurrency: 1 });
    const executor = createMockExecutor(30);

    const executionOrder: string[] = [];

    const makeCtx = (name: string, priority: number) => {
      const ctx = new ExecutionContext({
        input: name,
        options: { name, priority },
      });
      return scheduler.submit(ctx, {
        type: "thread",
        async execute(): Promise<string> {
          await new Promise((r) => setTimeout(r, 20));
          executionOrder.push(name);
          return name;
        },
        async terminate() {},
        async destroy() {},
      });
    };

    // Submit tasks: first starts immediately, remaining 3 wait in queue
    const p0 = makeCtx("first", 0);
    const pLow = makeCtx("low", 1);
    const pHigh = makeCtx("high", 10);
    const pMid = makeCtx("mid", 5);

    await Promise.all([p0, pLow, pHigh, pMid]);

    // "first" ran immediately, then "high" (10), "mid" (5), "low" (1)
    expect(executionOrder).toEqual(["first", "high", "mid", "low"]);
  });

  it("should cancel task if aborted while waiting in queue", async () => {
    const scheduler = new TaskScheduler({ maxConcurrency: 1 });
    const controller = new AbortController();

    // Block slot with a slow task
    const blockerCtx = new ExecutionContext({ input: "blocker" });
    const blockerPromise = scheduler.submit(blockerCtx, createMockExecutor(50));

    // Queued task that gets aborted
    const queuedCtx = new ExecutionContext({
      input: "queued",
      options: { signal: controller.signal },
    });
    const queuedPromise = scheduler.submit(queuedCtx, createMockExecutor(10));

    // Abort while waiting
    controller.abort("User cancelled in queue");

    await expect(queuedPromise).rejects.toThrow(/cancelled/i);
    expect(queuedCtx.status).toBe("cancelled");

    await blockerPromise;
  });

  it("should clear pending tasks on clear()", async () => {
    const scheduler = new TaskScheduler({ maxConcurrency: 1 });
    const blockerCtx = new ExecutionContext({ input: "blocker" });
    const blockerPromise = scheduler.submit(blockerCtx, createMockExecutor(50));

    const queuedCtx = new ExecutionContext({ input: "queued" });
    const queuedPromise = scheduler.submit(queuedCtx, createMockExecutor(10));

    scheduler.clear("Shutdown clear");
    await expect(queuedPromise).rejects.toThrow("Shutdown clear");

    await blockerPromise;
  });
});
