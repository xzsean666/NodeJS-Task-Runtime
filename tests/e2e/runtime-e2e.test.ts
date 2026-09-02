import { describe, it, expect, afterEach } from "vitest";
import { createRuntime, RuntimeError, RuntimeErrorCode } from "../../src/index.js";
import type { TaskRuntime } from "../../src/core/runtime.js";

describe("Task Runtime E2E Suite", () => {
  let runtime: TaskRuntime;

  afterEach(async () => {
    if (runtime) {
      await runtime.destroy();
    }
  });

  it("should execute intensive parallel compute tasks on worker threads", async () => {
    runtime = createRuntime({ workers: 4 });

    // CPU-intensive task: calculate nth fibonacci
    const fib = runtime.task(
      (n: number) => {
        const calculateFib = (num: number): number => {
          if (num <= 1) return num;
          let a = 0,
            b = 1;
          for (let i = 2; i <= num; i++) {
            const c = a + b;
            a = b;
            b = c;
          }
          return b;
        };
        return calculateFib(n);
      },
      { name: "fibonacci" }
    );

    const inputs = [10, 20, 30, 40, 45];
    const results = await fib.batch(inputs);

    expect(results).toEqual([55, 6765, 832040, 102334155, 1134903170]);

    const stats = runtime.stats();
    expect(stats.totalTasks).toBe(5);
    expect(stats.completedTasks).toBe(5);
    expect(stats.failedTasks).toBe(0);
  });

  it("should execute CLI tasks seamlessly alongside thread tasks", async () => {
    runtime = createRuntime({ workers: 2 });

    const jsTask = runtime.task((items: string[]) => items.map((s) => s.trim().toUpperCase()));

    const cliTask = runtime.cli<{ prefix: string; count: number }, { items: string[] }>("node", {
      name: "node-generator",
      args: (input) => [
        "-e",
        `const input = JSON.parse(process.argv[1]); const items = Array.from({ length: input.count }, (_, i) => input.prefix + '_' + i); console.log(JSON.stringify({ items }));`,
        JSON.stringify(input),
      ],
      stdout: "json",
    });

    const generated = await cliTask({ prefix: "task", count: 3 });
    expect(generated).toEqual({ items: ["task_0", "task_1", "task_2"] });

    const processed = await jsTask(generated.items);
    expect(processed).toEqual(["TASK_0", "TASK_1", "TASK_2"]);
  });

  it("should handle concurrency limits, priority scheduling, timeouts, and retries in a unified pipeline", async () => {
    runtime = createRuntime({
      workers: 2,
      maxConcurrency: 2,
    });

    const shared = new Int32Array(new SharedArrayBuffer(4));
    shared[0] = 0;

    const flakyTask = runtime.task(
      (data: { sharedBuf: SharedArrayBuffer }) => {
        const arr = new Int32Array(data.sharedBuf);
        arr[0]++;
        if (arr[0] < 2) {
          throw new Error("Temporary network glitch");
        }
        return "recovered";
      },
      {
        name: "flaky",
        retry: {
          attempts: 3,
          backoff: "fixed",
          delay: 20,
        },
      }
    );

    const result = await flakyTask({ sharedBuf: shared.buffer as SharedArrayBuffer });
    expect(result).toBe("recovered");
    expect(shared[0]).toBe(2);

    const stats = runtime.stats();
    expect(stats.retriedTasks).toBeGreaterThanOrEqual(1);
  });

  it("should abort in-flight execution when runtime is cancelled via AbortSignal", async () => {
    runtime = createRuntime({ workers: 2 });
    const controller = new AbortController();

    const longRunning = runtime.task(
      () => new Promise((resolve) => setTimeout(resolve, 10000)),
      { name: "longRunning", timeout: 5000 }
    );

    const runPromise = longRunning(null, { signal: controller.signal });
    setTimeout(() => {
      controller.abort("User clicked cancel");
    }, 50);

    await expect(runPromise).rejects.toSatisfy((err: unknown) => {
      expect(RuntimeError.isRuntimeError(err)).toBe(true);
      if (RuntimeError.isRuntimeError(err)) {
        expect(err.code).toBe(RuntimeErrorCode.TASK_CANCELLED);
      }
      return true;
    });
  });

  it("should perform graceful shutdown draining all active tasks", async () => {
    runtime = createRuntime({ workers: 4 });

    const slowTask = runtime.task(
      (ms: number) => new Promise((resolve) => setTimeout(() => resolve(`done in ${ms}ms`), ms)),
      { name: "slowTask" }
    );

    const p1 = slowTask(30);
    const p2 = slowTask(50);

    // Initiate graceful shutdown while tasks are in progress
    const shutdownPromise = runtime.shutdown();

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe("done in 30ms");
    expect(r2).toBe("done in 50ms");

    await shutdownPromise;
    expect(runtime.state).toBe("stopped");
  });
});
