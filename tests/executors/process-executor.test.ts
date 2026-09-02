import { describe, it, expect, afterEach } from "vitest";
import { ProcessExecutor } from "../../src/executors/process/executor.js";
import { ExecutionContext } from "../../src/core/execution.js";
import { RuntimeError, RuntimeErrorCode } from "../../src/execution/error.js";

describe("ProcessExecutor", () => {
  let executor: ProcessExecutor;

  afterEach(async () => {
    if (executor) {
      await executor.destroy();
    }
  });

  it("should execute task function in isolated child process", async () => {
    executor = new ProcessExecutor();

    const ctx = new ExecutionContext({
      input: { a: 100, b: 200 },
      options: {
        name: "isolated-calc",
        metadata: {
          fn: (data: { a: number; b: number }) => ({ result: data.a * data.b }),
        },
      },
    });

    const output = await executor.execute<{ result: number }>(ctx);
    expect(output).toEqual({ result: 20000 });
  });

  it("should handle error thrown inside child process", async () => {
    executor = new ProcessExecutor();

    const ctx = new ExecutionContext({
      input: null,
      options: {
        metadata: {
          fn: () => {
            throw new Error("Process calculation failed");
          },
        },
      },
    });

    await expect(executor.execute(ctx)).rejects.toSatisfy((err: unknown) => {
      expect(RuntimeError.isRuntimeError(err)).toBe(true);
      if (RuntimeError.isRuntimeError(err)) {
        expect(err.code).toBe(RuntimeErrorCode.PROCESS_FAILED);
        expect(err.stderr).toContain("Process calculation failed");
      }
      return true;
    });
  });

  it("should handle cancellation in child process", async () => {
    executor = new ProcessExecutor();
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
      controller.abort("Process timeout abort");
    }, 50);

    await expect(execPromise).rejects.toSatisfy((err: unknown) => {
      expect(RuntimeError.isRuntimeError(err)).toBe(true);
      if (RuntimeError.isRuntimeError(err)) {
        expect(err.cancelled).toBe(true);
      }
      return true;
    });
  });

  it("should correctly return undefined when child function returns undefined", async () => {
    executor = new ProcessExecutor();

    const ctx = new ExecutionContext({
      input: null,
      options: {
        metadata: {
          fn: () => {},
        },
      },
    });

    const output = await executor.execute(ctx);
    expect(output).toBeUndefined();
  });

  it("should support stats, terminate and memory limits", async () => {
    executor = new ProcessExecutor();

    const ctx = new ExecutionContext({
      input: null,
      options: {
        resource: { maxMemoryMb: 256 },
        metadata: {
          fn: () => new Promise((resolve) => setTimeout(resolve, 10000)),
        },
      },
    });

    const execPromise = executor.execute(ctx);
    await new Promise((r) => setTimeout(r, 50));

    expect(executor.stats().active).toBeGreaterThanOrEqual(1);

    await executor.terminate(ctx.executionId, "Manual kill");
    await expect(execPromise).rejects.toThrow();

    expect(executor.stats().active).toBe(0);
  });
});
