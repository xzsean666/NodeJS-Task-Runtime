/**
 * Type-safe event center for Task Runtime observability.
 */

import { EventEmitter } from "node:events";
import type { ExecutorType, LifecycleState } from "../core/types.js";
import type { RuntimeError } from "../execution/error.js";

export interface TaskQueuedEvent {
  taskId: string;
  executionId: string;
  taskName?: string;
  priority: number;
}

export interface TaskStartEvent {
  taskId: string;
  executionId: string;
  taskName?: string;
  executor: ExecutorType;
  retryCount: number;
  timestamp: number;
}

export interface TaskCompleteEvent {
  taskId: string;
  executionId: string;
  taskName?: string;
  executor: ExecutorType;
  durationMs: number;
  result: unknown;
}

export interface TaskErrorEvent {
  taskId: string;
  executionId: string;
  taskName?: string;
  executor: ExecutorType;
  durationMs: number;
  error: RuntimeError;
}

export interface TaskTimeoutEvent {
  taskId: string;
  executionId: string;
  taskName?: string;
  timeoutMs: number;
}

export interface TaskCancelEvent {
  taskId: string;
  executionId: string;
  taskName?: string;
  reason?: string;
}

export interface TaskRetryEvent {
  taskId: string;
  executionId: string;
  taskName?: string;
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  error: RuntimeError;
}

export interface WorkerSpawnEvent {
  workerId: string;
  type: ExecutorType;
}

export interface WorkerExitEvent {
  workerId: string;
  code: number | null;
  signal: string | null;
}

export interface WorkerCrashEvent {
  workerId: string;
  error: Error;
}

export interface LifecycleChangeEvent {
  from: LifecycleState;
  to: LifecycleState;
}

export interface RuntimeEventMap {
  "task:queued": TaskQueuedEvent;
  "task:start": TaskStartEvent;
  "task:complete": TaskCompleteEvent;
  "task:error": TaskErrorEvent;
  "task:timeout": TaskTimeoutEvent;
  "task:cancel": TaskCancelEvent;
  "task:retry": TaskRetryEvent;
  "worker:spawn": WorkerSpawnEvent;
  "worker:exit": WorkerExitEvent;
  "worker:crash": WorkerCrashEvent;
  "lifecycle:change": LifecycleChangeEvent;
}

export type RuntimeEventName = keyof RuntimeEventMap;

export type RuntimeEventListener<K extends RuntimeEventName> = (
  payload: RuntimeEventMap[K]
) => void;

export class RuntimeEventEmitter {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Avoid default listener leak warnings for high-throughput runtime
    this.emitter.setMaxListeners(100);
  }

  on<K extends RuntimeEventName>(event: K, listener: RuntimeEventListener<K>): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  once<K extends RuntimeEventName>(event: K, listener: RuntimeEventListener<K>): this {
    this.emitter.once(event, listener as (...args: unknown[]) => void);
    return this;
  }

  off<K extends RuntimeEventName>(event: K, listener: RuntimeEventListener<K>): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  emit<K extends RuntimeEventName>(event: K, payload: RuntimeEventMap[K]): boolean {
    return this.emitter.emit(event, payload);
  }

  removeAllListeners(event?: RuntimeEventName): this {
    this.emitter.removeAllListeners(event);
    return this;
  }

  listenerCount(event: RuntimeEventName): number {
    return this.emitter.listenerCount(event);
  }
}
