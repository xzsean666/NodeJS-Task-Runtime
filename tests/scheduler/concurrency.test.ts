import { describe, it, expect } from "vitest";
import { ConcurrencyLimiter } from "../../src/scheduler/concurrency.js";

describe("ConcurrencyLimiter", () => {
  it("should enforce global concurrency limits", () => {
    const limiter = new ConcurrencyLimiter({ maxConcurrency: 2 });
    expect(limiter.canAcquire()).toBe(true);

    const release1 = limiter.acquire();
    expect(limiter.activeGlobal).toBe(1);
    expect(limiter.canAcquire()).toBe(true);

    const release2 = limiter.acquire();
    expect(limiter.activeGlobal).toBe(2);
    expect(limiter.canAcquire()).toBe(false);

    release1();
    expect(limiter.activeGlobal).toBe(1);
    expect(limiter.canAcquire()).toBe(true);

    release2();
    expect(limiter.activeGlobal).toBe(0);
  });

  it("should enforce per-task concurrency limits", () => {
    const limiter = new ConcurrencyLimiter({ maxConcurrency: 10 });
    limiter.setTaskLimit("heavyTask", 1);

    expect(limiter.canAcquire("heavyTask")).toBe(true);
    const release1 = limiter.acquire("heavyTask");
    expect(limiter.activeForTask("heavyTask")).toBe(1);
    expect(limiter.canAcquire("heavyTask")).toBe(false);
    expect(limiter.canAcquire("otherTask")).toBe(true);

    release1();
    expect(limiter.activeForTask("heavyTask")).toBe(0);
    expect(limiter.canAcquire("heavyTask")).toBe(true);
  });

  it("should support dynamic custom task limit in canAcquire", () => {
    const limiter = new ConcurrencyLimiter();
    const release1 = limiter.acquire("download");
    expect(limiter.canAcquire("download", 1)).toBe(false);
    expect(limiter.canAcquire("download", 2)).toBe(true);
    release1();
  });
});
