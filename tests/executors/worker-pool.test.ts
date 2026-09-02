import { describe, it, expect, afterEach } from "vitest";
import { WorkerPool } from "../../src/executors/thread/pool.js";
import { RuntimeEventEmitter } from "../../src/observability/events.js";

describe("WorkerPool", () => {
  let pool: WorkerPool;

  afterEach(async () => {
    if (pool) {
      await pool.destroy();
    }
  });

  it("should initialize workers with specified size and auto calculation", () => {
    pool = new WorkerPool({ size: 2 });
    pool.start();

    expect(pool.size).toBe(2);
    expect(pool.totalWorkers).toBe(2);
    expect(pool.activeWorkers).toBe(0);
    expect(pool.idleWorkers).toBe(2);
  });

  it("should execute JS functions in worker threads and return results", async () => {
    pool = new WorkerPool({ size: 2 });

    const add = (data: { a: number; b: number }) => data.a + data.b;
    const result = await pool.execute({
      executionId: "e1",
      fn: add,
      input: { a: 15, b: 27 },
    });

    expect(result).toBe(42);
  });

  it("should handle function errors gracefully", async () => {
    pool = new WorkerPool({ size: 1 });

    const failFn = () => {
      throw new Error("Worker computation explosion");
    };

    await expect(
      pool.execute({
        executionId: "e2",
        fn: failFn,
        input: null,
      })
    ).rejects.toThrow("Worker computation explosion");
  });

  it("should auto-heal and replace crashed worker on unexpected termination", async () => {
    const events = new RuntimeEventEmitter();
    let crashEmitted = false;
    events.on("worker:exit", () => {
      crashEmitted = true;
    });

    pool = new WorkerPool({ size: 2 }, events);
    pool.start();

    // Pick one worker from the pool and terminate it directly to simulate a crash/killed worker
    const workers = Array.from((pool as any).workers.values()) as any[];
    const targetWorker = workers[0];

    await targetWorker.worker.terminate();

    // Give time for auto-healing to spawn replacement worker
    await new Promise((r) => setTimeout(r, 100));

    // Worker pool should have healed back to 2 workers
    expect(pool.totalWorkers).toBe(2);
    expect(crashEmitted).toBe(true);

    // Should be able to execute new task successfully on the healthy pool
    const successResult = await pool.execute({
      executionId: "e-after-heal",
      fn: (x: number) => x * 2,
      input: 21,
    });

    expect(successResult).toBe(42);
  });

  it("should terminate specific execution on terminateExecution", async () => {
    pool = new WorkerPool({ size: 2 });

    const infinitePromise = pool.execute({
      executionId: "e-hang",
      fn: () => new Promise((resolve) => setTimeout(resolve, 60000)),
      input: null,
    });

    // Attach expectation early to prevent unhandled rejection warning
    const assertionPromise = expect(infinitePromise).rejects.toThrow(/Aborted by test/);

    await new Promise((r) => setTimeout(r, 50));
    await pool.terminateExecution("e-hang", "Aborted by test");

    await assertionPromise;
  });
});
