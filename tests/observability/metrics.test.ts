import { describe, it, expect } from "vitest";
import { MetricsCollector } from "../../src/observability/metrics.js";
import { RuntimeEventEmitter } from "../../src/observability/events.js";
import { RuntimeError } from "../../src/execution/error.js";

describe("MetricsCollector", () => {
  it("should aggregate runtime stats correctly across events", () => {
    const events = new RuntimeEventEmitter();
    const metrics = new MetricsCollector(events);

    events.emit("task:queued", {
      taskId: "t1",
      executionId: "e1",
      priority: 0,
    });
    events.emit("task:start", {
      taskId: "t1",
      executionId: "e1",
      executor: "thread",
      retryCount: 0,
      timestamp: 100,
    });
    events.emit("task:complete", {
      taskId: "t1",
      executionId: "e1",
      executor: "thread",
      durationMs: 50,
      result: 42,
    });

    events.emit("task:queued", {
      taskId: "t2",
      executionId: "e2",
      priority: 0,
    });
    events.emit("task:start", {
      taskId: "t2",
      executionId: "e2",
      executor: "thread",
      retryCount: 0,
      timestamp: 200,
    });
    events.emit("task:error", {
      taskId: "t2",
      executionId: "e2",
      executor: "thread",
      durationMs: 30,
      error: RuntimeError.timeout(30),
    });

    const stats = metrics.getStats({ active: 1, idle: 1, total: 2 });

    expect(stats.totalTasks).toBe(2);
    expect(stats.completedTasks).toBe(1);
    expect(stats.failedTasks).toBe(1);
    expect(stats.timedOutTasks).toBe(1);
    expect(stats.activeWorkers).toBe(1);
    expect(stats.totalWorkers).toBe(2);
    expect(stats.averageDurationMs).toBe(40);
  });

  it("should decrement queuedTasks on queue cancellation and activeExecutions on running cancellation", () => {
    const events = new RuntimeEventEmitter();
    const metrics = new MetricsCollector(events);

    // Enqueue 2 tasks
    events.emit("task:queued", { taskId: "t1", executionId: "e1", priority: 0 });
    events.emit("task:queued", { taskId: "t2", executionId: "e2", priority: 0 });

    expect(metrics.getStats().queuedTasks).toBe(2);

    // Cancel t1 while in queue
    events.emit("task:cancel", { taskId: "t1", executionId: "e1", stage: "queued" });
    expect(metrics.getStats().queuedTasks).toBe(1);
    expect(metrics.getStats().cancelledTasks).toBe(1);

    // Start t2
    events.emit("task:start", { taskId: "t2", executionId: "e2", executor: "thread", retryCount: 0, timestamp: 100 });
    expect(metrics.getStats().queuedTasks).toBe(0);
    expect(metrics.getStats().activeExecutions).toBe(1);

    // Cancel t2 while running
    events.emit("task:cancel", { taskId: "t2", executionId: "e2", stage: "running" });
    expect(metrics.getStats().activeExecutions).toBe(0);
    expect(metrics.getStats().cancelledTasks).toBe(2);
  });

  it("should reset metrics on reset()", () => {
    const events = new RuntimeEventEmitter();
    const metrics = new MetricsCollector(events);

    events.emit("task:queued", { taskId: "t1", executionId: "e1", priority: 0 });
    events.emit("task:retry", { taskId: "t1", executionId: "e1", attempt: 1, maxAttempts: 3, delayMs: 100, error: RuntimeError.cancelled() });

    expect(metrics.getStats().totalTasks).toBe(1);
    expect(metrics.getStats().retriedTasks).toBe(1);

    metrics.reset();

    const fresh = metrics.getStats();
    expect(fresh.totalTasks).toBe(0);
    expect(fresh.retriedTasks).toBe(0);
    expect(fresh.queuedTasks).toBe(0);
  });
});
