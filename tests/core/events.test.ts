import { describe, it, expect, vi } from "vitest";
import { RuntimeEventEmitter } from "../../src/observability/events.js";
import { RuntimeError } from "../../src/execution/error.js";

describe("RuntimeEventEmitter", () => {
  it("should emit and handle typed events", () => {
    const emitter = new RuntimeEventEmitter();
    const startHandler = vi.fn();
    const completeHandler = vi.fn();

    emitter.on("task:start", startHandler);
    emitter.on("task:complete", completeHandler);

    emitter.emit("task:start", {
      taskId: "task-1",
      executionId: "exec-1",
      executor: "thread",
      retryCount: 0,
      timestamp: 1000,
    });

    expect(startHandler).toHaveBeenCalledWith({
      taskId: "task-1",
      executionId: "exec-1",
      executor: "thread",
      retryCount: 0,
      timestamp: 1000,
    });

    emitter.emit("task:complete", {
      taskId: "task-1",
      executionId: "exec-1",
      executor: "thread",
      durationMs: 42,
      result: { data: "success" },
    });

    expect(completeHandler).toHaveBeenCalledWith({
      taskId: "task-1",
      executionId: "exec-1",
      executor: "thread",
      durationMs: 42,
      result: { data: "success" },
    });
  });

  it("should support once and off", () => {
    const emitter = new RuntimeEventEmitter();
    const errorHandler = vi.fn();

    emitter.once("task:error", errorHandler);

    const err = RuntimeError.timeout(1000);
    emitter.emit("task:error", {
      taskId: "task-2",
      executionId: "exec-2",
      executor: "process",
      durationMs: 1000,
      error: err,
    });

    expect(errorHandler).toHaveBeenCalledTimes(1);

    // Second emit should not trigger once handler
    emitter.emit("task:error", {
      taskId: "task-2",
      executionId: "exec-2",
      executor: "process",
      durationMs: 1000,
      error: err,
    });

    expect(errorHandler).toHaveBeenCalledTimes(1);
  });

  it("should remove listeners properly", () => {
    const emitter = new RuntimeEventEmitter();
    const fn = vi.fn();

    emitter.on("task:queued", fn);
    expect(emitter.listenerCount("task:queued")).toBe(1);

    emitter.off("task:queued", fn);
    expect(emitter.listenerCount("task:queued")).toBe(0);

    emitter.on("task:queued", fn);
    emitter.removeAllListeners("task:queued");
    expect(emitter.listenerCount("task:queued")).toBe(0);
  });
});
