import { describe, it, expect, afterEach } from "vitest";
import { CLIExecutor } from "../../src/executors/cli/executor.js";
import { ExecutionContext } from "../../src/core/execution.js";
import { RuntimeError, RuntimeErrorCode } from "../../src/execution/error.js";

describe("CLIExecutor", () => {
  let executor: CLIExecutor;

  afterEach(async () => {
    if (executor) {
      await executor.destroy();
    }
  });

  it("should execute standard command and parse string output", async () => {
    executor = new CLIExecutor("node");

    const ctx = new ExecutionContext({
      input: null,
      options: {
        args: ["-e", "console.log('Hello from CLI')"],
        stdout: "string",
      },
    });

    const result = await executor.execute(ctx);
    expect(result).toBe("Hello from CLI");
  });

  it("should execute command and parse JSON output", async () => {
    executor = new CLIExecutor("node");

    const ctx = new ExecutionContext({
      input: { a: 10, b: 20 },
      options: {
        args: ["-e", "console.log(JSON.stringify({ sum: 30 }))"],
        stdout: "json",
      },
    });

    const result = await executor.execute<{ sum: number }>(ctx);
    expect(result).toEqual({ sum: 30 });
  });

  it("should support dynamic args function based on input", async () => {
    executor = new CLIExecutor("node");

    const ctx = new ExecutionContext({
      input: { text: "dynamic-arg" },
      options: {
        args: (input: { text: string }) => ["-e", `console.log('${input.text}')`],
        stdout: "string",
      },
    });

    const result = await executor.execute(ctx);
    expect(result).toBe("dynamic-arg");
  });

  it("should reject with RuntimeError when command exits with non-zero code", async () => {
    executor = new CLIExecutor("node");

    const ctx = new ExecutionContext({
      input: null,
      options: {
        args: ["-e", "process.stderr.write('Fatal error\\n'); process.exit(42);"],
      },
    });

    await expect(executor.execute(ctx)).rejects.toSatisfy((err: unknown) => {
      expect(RuntimeError.isRuntimeError(err)).toBe(true);
      if (RuntimeError.isRuntimeError(err)) {
        expect(err.code).toBe(RuntimeErrorCode.PROCESS_FAILED);
        expect(err.exitCode).toBe(42);
        expect(err.stderr).toContain("Fatal error");
      }
      return true;
    });
  });

  it("should abort CLI process on AbortSignal", async () => {
    executor = new CLIExecutor("node");
    const controller = new AbortController();

    const ctx = new ExecutionContext({
      input: null,
      options: {
        args: ["-e", "setTimeout(() => {}, 10000)"],
        signal: controller.signal,
      },
    });

    const execPromise = executor.execute(ctx);
    setTimeout(() => {
      controller.abort("User stopped process");
    }, 50);

    await expect(execPromise).rejects.toSatisfy((err: unknown) => {
      expect(RuntimeError.isRuntimeError(err)).toBe(true);
      if (RuntimeError.isRuntimeError(err)) {
        expect(err.cancelled).toBe(true);
      }
      return true;
    });
  });
});
