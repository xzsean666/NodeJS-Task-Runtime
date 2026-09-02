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
});
