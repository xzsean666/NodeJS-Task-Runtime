import { describe, it, expect, vi } from "vitest";
import { LifecycleManager } from "../../src/core/lifecycle.js";
import { ExecutionContext } from "../../src/core/execution.js";
import { RuntimeEventEmitter } from "../../src/observability/events.js";

describe("LifecycleManager", () => {
  it("should initialize in created state and transition to running", () => {
    const events = new RuntimeEventEmitter();
    const eventHandler = vi.fn();
    events.on("lifecycle:change", eventHandler);

    const lifecycle = new LifecycleManager({ eventEmitter: events });
    expect(lifecycle.state).toBe("created");

    lifecycle.start();
    expect(lifecycle.state).toBe("running");
    expect(lifecycle.isRunning).toBe(true);
    expect(eventHandler).toHaveBeenCalledWith({ from: "created", to: "running" });
  });

  it("assertAcceptingTasks should auto-start from created and throw when stopped/draining", async () => {
    const lifecycle = new LifecycleManager();
    expect(lifecycle.state).toBe("created");

    lifecycle.assertAcceptingTasks();
    expect(lifecycle.state).toBe("running");

    await lifecycle.shutdown();
    expect(lifecycle.state).toBe("stopped");

    expect(() => lifecycle.assertAcceptingTasks()).toThrowError(/Runtime is stopped/);
  });

  it("should track active executions and wait for draining on graceful shutdown", async () => {
    const lifecycle = new LifecycleManager({ shutdownTimeout: 1000 });
    lifecycle.start();

    const ctx1 = new ExecutionContext({ input: 1 });
    const ctx2 = new ExecutionContext({ input: 2 });

    lifecycle.registerExecution(ctx1);
    lifecycle.registerExecution(ctx2);
    expect(lifecycle.activeCount).toBe(2);

    let shutdownCompleted = false;
    const shutdownPromise = lifecycle.shutdown().then(() => {
      shutdownCompleted = true;
    });

    expect(lifecycle.state).toBe("draining");
    expect(shutdownCompleted).toBe(false);

    // Unregister first execution
    lifecycle.unregisterExecution(ctx1);
    expect(lifecycle.activeCount).toBe(1);
    expect(shutdownCompleted).toBe(false);

    // Unregister second execution
    lifecycle.unregisterExecution(ctx2);
    expect(lifecycle.activeCount).toBe(0);

    await shutdownPromise;
    expect(shutdownCompleted).toBe(true);
    expect(lifecycle.state).toBe("stopped");
  });

  it("should timeout drain and abort remaining executions if they exceed timeout", async () => {
    const lifecycle = new LifecycleManager({ shutdownTimeout: 50 });
    lifecycle.start();

    const ctx = new ExecutionContext({ input: "long" });
    lifecycle.registerExecution(ctx);

    await lifecycle.shutdown(50);
    expect(lifecycle.state).toBe("stopped");
    expect(ctx.isAborted).toBe(true);
  });

  it("forceStop should immediately abort executions and set stopped", () => {
    const lifecycle = new LifecycleManager();
    lifecycle.start();

    const ctx = new ExecutionContext({ input: "force" });
    lifecycle.registerExecution(ctx);

    lifecycle.forceStop();
    expect(lifecycle.state).toBe("stopped");
    expect(ctx.isAborted).toBe(true);
    expect(lifecycle.activeCount).toBe(0);
  });
});
