import { describe, it, expect, vi } from "vitest";
import { withTimeout } from "../../src/execution/timeout.js";
import { RuntimeError, RuntimeErrorCode } from "../../src/execution/error.js";

describe("withTimeout", () => {
  it("should return action result when action completes within timeout", async () => {
    const result = await withTimeout(
      async () => {
        return 42;
      },
      { timeoutMs: 1000 }
    );
    expect(result).toBe(42);
  });

  it("should reject with timeout RuntimeError and call onTimeout when action exceeds timeout", async () => {
    const onTimeout = vi.fn();

    const promise = withTimeout(
      async () => {
        await new Promise((r) => setTimeout(r, 200));
        return "late";
      },
      {
        timeoutMs: 50,
        taskId: "t-timeout",
        onTimeout,
      }
    );

    await expect(promise).rejects.toSatisfy((err: unknown) => {
      expect(RuntimeError.isRuntimeError(err)).toBe(true);
      if (RuntimeError.isRuntimeError(err)) {
        expect(err.code).toBe(RuntimeErrorCode.TASK_TIMEOUT);
        expect(err.timeout).toBe(true);
        expect(err.taskId).toBe("t-timeout");
      }
      return true;
    });

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("should pass through original error when action throws within timeout", async () => {
    const promise = withTimeout(
      async () => {
        throw new Error("Internal error");
      },
      { timeoutMs: 1000 }
    );

    await expect(promise).rejects.toThrow("Internal error");
  });
});
