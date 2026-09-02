import { describe, it, expect } from "vitest";
import { ExecutionContext } from "../../src/core/execution.js";
import { RuntimeErrorCode } from "../../src/execution/error.js";

describe("ExecutionContext", () => {
  it("should initialize with default IDs, status, and abort controller", () => {
    const context = new ExecutionContext({
      input: { x: 10, y: 20 },
      options: { name: "add" },
    });

    expect(context.taskId).toMatch(/^task_/);
    expect(context.executionId).toMatch(/^exec_/);
    expect(context.taskName).toBe("add");
    expect(context.status).toBe("pending");
    expect(context.retryCount).toBe(0);
    expect(context.isAborted).toBe(false);
  });

  it("should transition status from pending to queued, running and completed", () => {
    const context = new ExecutionContext({ input: 42 });

    context.markQueued();
    expect(context.status).toBe("queued");

    context.markRunning();
    expect(context.status).toBe("running");
    expect(context.startedAt).toBeGreaterThan(0);

    context.markCompleted(84);
    expect(context.status).toBe("completed");
    expect(context.result).toBe(84);
    expect(context.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("should handle failure and wrap error into RuntimeError", () => {
    const context = new ExecutionContext({ input: "fail" });
    context.markRunning();

    const err = context.markFailed(new Error("Computation failed"));
    expect(context.status).toBe("failed");
    expect(context.error).toBe(err);
    expect(err.code).toBe(RuntimeErrorCode.TASK_EXECUTION_FAILED);
    expect(err.taskId).toBe(context.taskId);
    expect(err.executionId).toBe(context.executionId);
  });

  it("should handle timeout correctly", () => {
    const context = new ExecutionContext({ input: "test" });
    context.markRunning();

    const err = context.markTimedOut(2000);
    expect(context.status).toBe("timed_out");
    expect(context.isAborted).toBe(true);
    expect(err.code).toBe(RuntimeErrorCode.TASK_TIMEOUT);
    expect(err.timeout).toBe(true);
  });

  it("should handle cancellation via abort()", () => {
    const context = new ExecutionContext({ input: "test" });
    context.markRunning();

    context.abort("User stopped");
    expect(context.status).toBe("cancelled");
    expect(context.isAborted).toBe(true);
    expect(context.error?.code).toBe(RuntimeErrorCode.TASK_CANCELLED);
  });

  it("should propagate external AbortSignal", () => {
    const controller = new AbortController();
    const context = new ExecutionContext({
      input: "test",
      options: { signal: controller.signal },
    });

    expect(context.isAborted).toBe(false);
    controller.abort("External abort");
    expect(context.isAborted).toBe(true);
    expect(context.status).toBe("cancelled");
  });

  it("should handle already aborted signal on creation", () => {
    const controller = new AbortController();
    controller.abort("Immediate abort");

    const context = new ExecutionContext({
      input: "test",
      options: { signal: controller.signal },
    });

    expect(context.isAborted).toBe(true);
    expect(context.status).toBe("cancelled");
  });

  it("should create next attempt context for retries", () => {
    const context = new ExecutionContext({
      taskId: "custom-task-id",
      input: "retry-me",
      options: { name: "flaky" },
      retryCount: 0,
    });

    const next = context.nextAttempt();
    expect(next.taskId).toBe(context.taskId);
    expect(next.executionId).not.toBe(context.executionId);
    expect(next.retryCount).toBe(1);
    expect(next.taskName).toBe("flaky");
    expect(next.status).toBe("pending");
  });
});
