/**
 * Lifecycle manager managing runtime state transitions and graceful shutdown.
 */

import type { LifecycleState } from "./types.js";
import type { ExecutionContext } from "./execution.js";
import type { RuntimeEventEmitter } from "../observability/events.js";
import { RuntimeError, RuntimeErrorCode } from "../execution/error.js";

export interface LifecycleOptions {
  eventEmitter?: RuntimeEventEmitter;
  shutdownTimeout?: number;
}

export class LifecycleManager {
  private _state: LifecycleState = "created";
  private readonly eventEmitter?: RuntimeEventEmitter;
  private readonly defaultShutdownTimeout: number;
  private readonly activeExecutions = new Map<string, ExecutionContext>();
  private drainPromiseResolve?: () => void;

  constructor(options: LifecycleOptions = {}) {
    this.eventEmitter = options.eventEmitter;
    this.defaultShutdownTimeout = options.shutdownTimeout ?? 10000;
  }

  get state(): LifecycleState {
    return this._state;
  }

  get isRunning(): boolean {
    return this._state === "running";
  }

  get isAcceptingTasks(): boolean {
    return this._state === "running";
  }

  get isDraining(): boolean {
    return this._state === "draining";
  }

  get isStopped(): boolean {
    return this._state === "stopped";
  }

  get activeCount(): number {
    return this.activeExecutions.size;
  }

  start(): void {
    if (this._state === "running") {
      return;
    }
    if (this._state === "draining") {
      throw new RuntimeError({
        code: RuntimeErrorCode.RUNTIME_DRAINING,
        message: "Cannot start a runtime that is currently draining",
      });
    }
    if (this._state === "stopped") {
      throw new RuntimeError({
        code: RuntimeErrorCode.RUNTIME_STOPPED,
        message: "Cannot restart a stopped runtime",
      });
    }
    this.transitionTo("running");
  }

  assertAcceptingTasks(): void {
    if (this._state === "created") {
      this.start();
      return;
    }
    if (this._state === "draining") {
      throw new RuntimeError({
        code: RuntimeErrorCode.RUNTIME_DRAINING,
        message: "Runtime is draining and cannot accept new tasks",
      });
    }
    if (this._state === "stopped") {
      throw new RuntimeError({
        code: RuntimeErrorCode.RUNTIME_STOPPED,
        message: "Runtime is stopped and cannot accept new tasks",
      });
    }
  }

  private drainChecker?: () => boolean;

  setDrainChecker(checker: () => boolean): void {
    this.drainChecker = checker;
  }

  registerExecution(context: ExecutionContext): void {
    this.activeExecutions.set(context.executionId, context);
  }

  unregisterExecution(context: ExecutionContext): void {
    this.activeExecutions.delete(context.executionId);
    this.checkDrainStatus();
  }

  checkDrainStatus(): void {
    if (this._state !== "draining") return;
    const isDrained = this.drainChecker
      ? this.drainChecker()
      : this.activeExecutions.size === 0;

    if (isDrained && this.drainPromiseResolve) {
      this.drainPromiseResolve();
    }
  }

  getActiveExecutions(): ExecutionContext[] {
    return Array.from(this.activeExecutions.values());
  }

  private shutdownPromise?: Promise<void>;

  async shutdown(timeoutMs?: number): Promise<void> {
    if (this._state === "stopped") {
      return;
    }
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.shutdownPromise = (async () => {
      const timeout = timeoutMs ?? this.defaultShutdownTimeout;
      this.transitionTo("draining");

      const isAlreadyDrained = this.drainChecker
        ? this.drainChecker()
        : this.activeExecutions.size === 0;

      if (!isAlreadyDrained) {
        let timer: NodeJS.Timeout | undefined;
        const drainPromise = new Promise<void>((resolve) => {
          this.drainPromiseResolve = resolve;
        });

        const timeoutPromise = new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            // Force abort any remaining executions upon timeout
            for (const execution of this.activeExecutions.values()) {
              execution.abort("Runtime shutdown timeout exceeded");
            }
            resolve();
          }, timeout);
          timer?.unref();
        });

        try {
          await Promise.race([drainPromise, timeoutPromise]);
        } finally {
          this.drainPromiseResolve = undefined;
          if (timer) {
            clearTimeout(timer);
          }
        }
      }

      this.transitionTo("stopped");
    })();

    return this.shutdownPromise;
  }

  forceStop(): void {
    if (this._state === "stopped") {
      return;
    }
    for (const execution of this.activeExecutions.values()) {
      execution.abort("Runtime forcefully stopped");
    }
    this.activeExecutions.clear();
    this.transitionTo("stopped");
  }

  private transitionTo(nextState: LifecycleState): void {
    if (this._state === nextState) return;
    const from = this._state;
    this._state = nextState;
    this.eventEmitter?.emit("lifecycle:change", { from, to: nextState });
  }
}
