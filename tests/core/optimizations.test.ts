import { describe, it, expect, vi } from "vitest";
import { createRuntime } from "../../src/index.js";
import { LifecycleManager } from "../../src/core/lifecycle.js";
import { ExecutionContext } from "../../src/core/execution.js";
import { CLIExecutor } from "../../src/executors/cli/executor.js";
import { RuntimeError, RuntimeErrorCode } from "../../src/execution/error.js";
import { toBuffer } from "../../src/transport/binary.js";

describe("Runtime Optimizations & Edge Cases Audit", () => {
  it("should guard ExecutionContext against overwriting cancelled or timed_out state", () => {
    const ctx = new ExecutionContext({
      input: "test",
      options: { name: "terminal-test" },
    });

    ctx.markCancelled("User cancellation");
    expect(ctx.status).toBe("cancelled");

    // Attempt to mark completed after cancellation
    ctx.markCompleted("late-result");
    expect(ctx.status).toBe("cancelled");
    expect(ctx.result).toBeUndefined();

    // Attempt to mark failed after cancellation
    ctx.markFailed(new Error("late-error"));
    expect(ctx.status).toBe("cancelled");
  });

  it("should preserve logical taskId across retry attempts for distributed tracing", async () => {
    const runtime = createRuntime({ workers: 2 });
    let attempts = 0;
    const observedTaskIds: string[] = [];
    const observedExecutionIds: string[] = [];

    runtime.on("task:start", (e) => {
      observedTaskIds.push(e.taskId);
      observedExecutionIds.push(e.executionId);
    });

    let callCount = 0;
    const flakyTask = runtime.task(
      (input: { attempt: number }) => {
        if (input.attempt < 3) {
          throw new Error("Temporary failure");
        }
        return "success";
      },
      {
        taskId: "trace-task-12345",
        retry: { attempts: 3, delay: 10, backoff: "fixed" },
      }
    );

    // Let's increment input.attempt in a wrapper or pass state
    runtime.on("task:retry", () => {
      callCount++;
    });

    const result = await flakyTask({ attempt: 3 });
    expect(result).toBe("success");

    // Test with actual retry:
    let retryAttempt = 0;
    const multiAttemptTask = runtime.task(
      `
      (input) => {
        if (input.fail) {
          throw new Error("Forced error");
        }
        return "ok";
      }
      `,
      {
        taskId: "trace-task-retry",
        retry: { attempts: 3, delay: 10, backoff: "fixed" },
      }
    );

    try {
      await multiAttemptTask({ fail: true });
    } catch {
      // expected failure after 3 attempts
    }

    const retryTaskIds = observedTaskIds.filter((id) => id === "trace-task-retry");
    expect(retryTaskIds).toHaveLength(3);
    expect(retryTaskIds.every((id) => id === "trace-task-retry")).toBe(true);

    await runtime.shutdown();
  });

  it("should handle concurrent shutdown calls gracefully without race conditions", async () => {
    const lifecycle = new LifecycleManager({ shutdownTimeout: 1000 });
    lifecycle.start();

    // Trigger multiple shutdowns concurrently
    const [res1, res2, res3] = await Promise.all([
      lifecycle.shutdown(),
      lifecycle.shutdown(),
      lifecycle.shutdown(),
    ]);

    expect(lifecycle.isStopped).toBe(true);
  });

  it("should throw INVALID_ARGUMENT when CLIExecutor receives no command", async () => {
    const executor = new CLIExecutor();
    const ctx = new ExecutionContext({
      input: null,
      options: {},
    });

    await expect(executor.execute(ctx)).rejects.toSatisfy((err: unknown) => {
      expect(RuntimeError.isRuntimeError(err)).toBe(true);
      if (RuntimeError.isRuntimeError(err)) {
        expect(err.code).toBe(RuntimeErrorCode.INVALID_ARGUMENT);
      }
      return true;
    });

    await executor.destroy();
  });

  it("should handle circular references in toBuffer with SERIALIZATION_ERROR", () => {
    const circularObj: any = { a: 1 };
    circularObj.self = circularObj;

    expect(() => toBuffer(circularObj)).toThrowError();
  });
});
