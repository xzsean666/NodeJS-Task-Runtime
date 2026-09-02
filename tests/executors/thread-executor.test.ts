import { describe, it, expect, afterEach } from "vitest";
import { ThreadExecutor } from "../../src/executors/thread/executor.js";
import { ExecutionContext } from "../../src/core/execution.js";

describe("ThreadExecutor", () => {
  let executor: ThreadExecutor;

  afterEach(async () => {
    if (executor) {
      await executor.destroy();
    }
  });

  it("should execute task via ExecutionContext", async () => {
    executor = new ThreadExecutor({ size: 2 });

    const ctx = new ExecutionContext({
      input: { numbers: [1, 2, 3, 4, 5] },
      options: {
        name: "sum",
        metadata: {
          fn: (data: { numbers: number[] }) => data.numbers.reduce((a, b) => a + b, 0),
        },
      },
    });

    const result = await executor.execute(ctx);
    expect(result).toBe(15);
  });

  it("should handle cancellation signal during execution", async () => {
    executor = new ThreadExecutor({ size: 2 });
    const controller = new AbortController();

    const ctx = new ExecutionContext({
      input: null,
      options: {
        signal: controller.signal,
        metadata: {
          fn: () => new Promise((resolve) => setTimeout(resolve, 10000)),
        },
      },
    });

    const execPromise = executor.execute(ctx);
    setTimeout(() => {
      controller.abort("User cancelled long computation");
    }, 50);

    await expect(execPromise).rejects.toThrow(/cancelled/i);
  });

  it("should return executor stats", () => {
    executor = new ThreadExecutor({ size: 3 });
    const stats = executor.stats();

    expect(stats.total).toBe(0); // Not started until first task or start
  });
});
