import { describe, it, expect } from "vitest";
import { RuntimeError, RuntimeErrorCode } from "../../src/execution/error.js";

describe("RuntimeError", () => {
  it("should create RuntimeError with full context", () => {
    const error = new RuntimeError({
      code: RuntimeErrorCode.TASK_TIMEOUT,
      message: "Operation timed out",
      taskId: "task-1",
      executionId: "exec-1",
      executor: "thread",
      timeout: true,
      retryCount: 2,
    });

    expect(error.name).toBe("RuntimeError");
    expect(error.code).toBe(RuntimeErrorCode.TASK_TIMEOUT);
    expect(error.message).toBe("Operation timed out");
    expect(error.taskId).toBe("task-1");
    expect(error.executionId).toBe("exec-1");
    expect(error.executor).toBe("thread");
    expect(error.timeout).toBe(true);
    expect(error.cancelled).toBe(false);
    expect(error.retryCount).toBe(2);
    expect(error.timestamp).toBeGreaterThan(0);
  });

  it("should recognize RuntimeError with isRuntimeError", () => {
    const customErr = new RuntimeError({
      code: RuntimeErrorCode.TASK_EXECUTION_FAILED,
      message: "Failed",
    });
    const standardErr = new Error("Standard error");

    expect(RuntimeError.isRuntimeError(customErr)).toBe(true);
    expect(RuntimeError.isRuntimeError(standardErr)).toBe(false);
    expect(RuntimeError.isRuntimeError("string error")).toBe(false);
    expect(RuntimeError.isRuntimeError(null)).toBe(false);
  });

  it("should create from standard Error with context", () => {
    const original = new Error("Something went wrong");
    const runtimeErr = RuntimeError.from(original, {
      taskId: "task-2",
      executionId: "exec-2",
      executor: "process",
    });

    expect(runtimeErr).toBeInstanceOf(RuntimeError);
    expect(runtimeErr.message).toBe("Something went wrong");
    expect(runtimeErr.taskId).toBe("task-2");
    expect(runtimeErr.executionId).toBe("exec-2");
    expect(runtimeErr.executor).toBe("process");
    expect(runtimeErr.cause).toBe(original);
  });

  it("should wrap existing RuntimeError and merge context", () => {
    const first = new RuntimeError({
      code: RuntimeErrorCode.TASK_EXECUTION_FAILED,
      message: "Original message",
      taskId: "task-1",
    });
    const second = RuntimeError.from(first, { executionId: "exec-99" });

    expect(second.taskId).toBe("task-1");
    expect(second.executionId).toBe("exec-99");
  });

  it("should support factory helpers", () => {
    const timeoutErr = RuntimeError.timeout(5000, { taskId: "t1" });
    expect(timeoutErr.code).toBe(RuntimeErrorCode.TASK_TIMEOUT);
    expect(timeoutErr.timeout).toBe(true);
    expect(timeoutErr.taskId).toBe("t1");

    const cancelErr = RuntimeError.cancelled("User aborted", { taskId: "t2" });
    expect(cancelErr.code).toBe(RuntimeErrorCode.TASK_CANCELLED);
    expect(cancelErr.cancelled).toBe(true);
    expect(cancelErr.message).toContain("User aborted");

    const workerCrashErr = RuntimeError.workerCrashed("Segmentation fault");
    expect(workerCrashErr.code).toBe(RuntimeErrorCode.WORKER_CRASHED);
    expect(workerCrashErr.executor).toBe("thread");

    const processFailErr = RuntimeError.processFailed(1, null, "error output");
    expect(processFailErr.code).toBe(RuntimeErrorCode.PROCESS_FAILED);
    expect(processFailErr.exitCode).toBe(1);
    expect(processFailErr.stderr).toBe("error output");

    const stoppedErr = RuntimeError.runtimeStopped();
    expect(stoppedErr.code).toBe(RuntimeErrorCode.RUNTIME_STOPPED);
  });

  it("should serialize to JSON properly", () => {
    const err = new RuntimeError({
      code: RuntimeErrorCode.PROCESS_FAILED,
      message: "CLI failed",
      taskId: "t-3",
      executionId: "e-3",
      executor: "cli",
      exitCode: 127,
      stderr: "command not found",
    });

    const json = err.toJSON();
    expect(json.name).toBe("RuntimeError");
    expect(json.code).toBe(RuntimeErrorCode.PROCESS_FAILED);
    expect(json.taskId).toBe("t-3");
    expect(json.executor).toBe("cli");
    expect(json.exitCode).toBe(127);
    expect(json.stderr).toBe("command not found");
  });
});
