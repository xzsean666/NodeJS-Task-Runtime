import { describe, it, expect, vi } from "vitest";
import {
  withRetry,
  calculateBackoffDelay,
  normalizeRetryOptions,
} from "../../src/execution/retry.js";
import { RuntimeError, RuntimeErrorCode } from "../../src/execution/error.js";

describe("withRetry", () => {
  it("should calculate backoff delays correctly for fixed, linear, and exponential", () => {
    expect(calculateBackoffDelay(1, { attempts: 3, backoff: "fixed", delay: 100 })).toBe(100);
    expect(calculateBackoffDelay(3, { attempts: 3, backoff: "fixed", delay: 100 })).toBe(100);

    expect(calculateBackoffDelay(1, { attempts: 3, backoff: "linear", delay: 100 })).toBe(100);
    expect(calculateBackoffDelay(2, { attempts: 3, backoff: "linear", delay: 100 })).toBe(200);
    expect(calculateBackoffDelay(3, { attempts: 3, backoff: "linear", delay: 100 })).toBe(300);

    expect(calculateBackoffDelay(1, { attempts: 3, backoff: "exponential", delay: 100 })).toBe(100);
    expect(calculateBackoffDelay(2, { attempts: 3, backoff: "exponential", delay: 100 })).toBe(200);
    expect(calculateBackoffDelay(3, { attempts: 3, backoff: "exponential", delay: 100 })).toBe(400);
  });

  it("should normalize numeric and object retry configs", () => {
    expect(normalizeRetryOptions(3)).toEqual({
      attempts: 3,
      backoff: "exponential",
      delay: 100,
      maxDelay: 30000,
    });
    expect(normalizeRetryOptions(1)).toBeUndefined();
    expect(normalizeRetryOptions(undefined)).toBeUndefined();
  });

  it("should succeed on first attempt without retrying if action succeeds", async () => {
    const fn = vi.fn().mockResolvedValue("success");
    const result = await withRetry(fn, { attempts: 3, delay: 10 });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should retry until success when temporary failure occurs", async () => {
    let count = 0;
    const fn = vi.fn().mockImplementation(async () => {
      count++;
      if (count < 3) {
        throw new Error(`Failure #${count}`);
      }
      return "finally succeeded";
    });

    const onRetry = vi.fn();
    const result = await withRetry(fn, { attempts: 3, delay: 10, backoff: "fixed" }, onRetry);

    expect(result).toBe("finally succeeded");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("should throw final error if all attempts fail", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Permanent error"));

    await expect(withRetry(fn, { attempts: 3, delay: 5 })).rejects.toThrow("Permanent error");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("should NOT retry cancelled errors", async () => {
    const fn = vi.fn().mockRejectedValue(RuntimeError.cancelled("User aborted"));

    await expect(withRetry(fn, { attempts: 3, delay: 5 })).rejects.toThrow(/cancelled/);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should respect retryIf predicate", async () => {
    const fn = vi.fn().mockRejectedValue(
      new RuntimeError({
        code: RuntimeErrorCode.TASK_EXECUTION_FAILED,
        message: "Fatal db error",
      })
    );

    const options = {
      attempts: 3,
      delay: 5,
      retryIf: (err: RuntimeError) => err.code !== RuntimeErrorCode.TASK_EXECUTION_FAILED,
    };

    await expect(withRetry(fn, options)).rejects.toThrow("Fatal db error");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
