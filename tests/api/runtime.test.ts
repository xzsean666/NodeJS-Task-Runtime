import { describe, it, expect, afterEach } from "vitest";
import { createRuntime } from "../../src/index.js";
import type { TaskRuntime } from "../../src/core/runtime.js";

describe("createRuntime & Task API", () => {
  let runtime: TaskRuntime;

  afterEach(async () => {
    if (runtime) {
      await runtime.destroy();
    }
  });

  it("should create runtime, define task, and execute successfully", async () => {
    runtime = createRuntime({ workers: 2 });

    const double = runtime.task((n: number) => n * 2, { name: "double" });
    expect(double.taskName).toBe("double");

    const result = await double(21);
    expect(result).toBe(42);

    const stats = runtime.stats();
    expect(stats.totalTasks).toBe(1);
    expect(stats.completedTasks).toBe(1);
    expect(stats.failedTasks).toBe(0);
  });

  it("should support runtime.cli task execution", async () => {
    runtime = createRuntime();

    const echoCli = runtime.cli<string, string>("node", {
      name: "node-echo",
      args: (input) => ["-e", `console.log('${input}')`],
      stdout: "string",
    });

    const result = await echoCli("hello world");
    expect(result).toBe("hello world");
  });

  it("should support runtime.all for parallel task execution", async () => {
    runtime = createRuntime({ workers: 4 });

    const square = runtime.task((x: number) => x * x);
    const results = await runtime.all([
      square(2),
      square(3),
      square(4),
    ]);

    expect(results).toEqual([4, 9, 16]);
  });

  it("should support event listeners on runtime instance", async () => {
    runtime = createRuntime({ workers: 2 });

    const completed: string[] = [];
    runtime.on("task:complete", (e) => {
      if (e.taskName) completed.push(e.taskName);
    });

    const taskA = runtime.task(() => "A", { name: "TaskA" });
    const taskB = runtime.task(() => "B", { name: "TaskB" });

    await Promise.all([taskA(null), taskB(null)]);
    expect(completed).toContain("TaskA");
    expect(completed).toContain("TaskB");
  });

  it("should shutdown gracefully and refuse new tasks", async () => {
    runtime = createRuntime({ workers: 2 });
    const quickTask = runtime.task((x: number) => x + 1);

    const res = await quickTask(10);
    expect(res).toBe(11);

    await runtime.shutdown();
    expect(runtime.state).toBe("stopped");

    await expect(quickTask(20)).rejects.toThrow(/Runtime is stopped/);
  });

  it("should integrate with custom logger when provided", async () => {
    const logs: string[] = [];
    const customLogger = {
      debug: (msg: string) => logs.push(`DEBUG: ${msg}`),
      info: (msg: string) => logs.push(`INFO: ${msg}`),
      warn: (msg: string) => logs.push(`WARN: ${msg}`),
      error: (msg: string) => logs.push(`ERROR: ${msg}`),
    };

    runtime = createRuntime({ workers: 2, logger: customLogger });
    const task = runtime.task((x: number) => x * 3, { name: "multiply" });

    await task(10);
    expect(logs.some((l) => l.includes("multiply"))).toBe(true);
  });

  it("should execute high-priority queued tasks before low-priority queued tasks when workers are saturated", async () => {
    // 1 worker to ensure queuing
    runtime = createRuntime({ workers: 1, maxConcurrency: 1 });

    const order: string[] = [];
    runtime.on("task:complete", (e) => {
      if (typeof e.result === "string") {
        order.push(e.result);
      }
    });

    const slowTask = runtime.task(
      async (name: string) => {
        await new Promise((r) => setTimeout(r, 60));
        return name;
      },
      { name: "processor" }
    );

    // First task occupies the 1 worker
    const p1 = slowTask("first", { priority: 0 });
    // Queued tasks with different priorities
    const pLow = slowTask("low", { priority: 1 });
    const pHigh = slowTask("high", { priority: 100 });
    const pMid = slowTask("mid", { priority: 10 });

    await Promise.all([p1, pLow, pHigh, pMid]);

    expect(order).toEqual(["first", "high", "mid", "low"]);
  });

  it("should reject queued tasks when runtime.destroy() is called", async () => {
    runtime = createRuntime({ workers: 1, maxConcurrency: 1 });

    const blocker = runtime.task(
      async () => {
        await new Promise((r) => setTimeout(r, 200));
        return "done";
      },
      { name: "blocker" }
    );

    const blockerPromise = blocker(null);
    const queuedPromise = blocker(null);

    // Give time to enqueue
    await new Promise((r) => setTimeout(r, 20));

    await runtime.destroy();

    await expect(queuedPromise).rejects.toThrow(/Runtime destroyed/);
    await expect(blockerPromise).rejects.toThrow();
  });
});
