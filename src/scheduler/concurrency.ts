/**
 * Concurrency limiter supporting global and per-task concurrency bounds.
 */

export interface ConcurrencyLimiterOptions {
  maxConcurrency?: number;
}

export class ConcurrencyLimiter {
  private globalLimit: number;
  private currentGlobalActive = 0;
  private readonly taskActive = new Map<string, number>();
  private readonly taskLimits = new Map<string, number>();

  constructor(options: ConcurrencyLimiterOptions = {}) {
    this.globalLimit = options.maxConcurrency && options.maxConcurrency > 0 ? options.maxConcurrency : Infinity;
  }

  get activeGlobal(): number {
    return this.currentGlobalActive;
  }

  get maxConcurrency(): number {
    return this.globalLimit;
  }

  setGlobalLimit(limit: number): void {
    this.globalLimit = limit > 0 ? limit : Infinity;
  }

  setTaskLimit(taskKey: string, limit: number): void {
    if (limit > 0) {
      this.taskLimits.set(taskKey, limit);
    } else {
      this.taskLimits.delete(taskKey);
    }
  }

  activeForTask(taskKey?: string): number {
    if (!taskKey) return 0;
    return this.taskActive.get(taskKey) ?? 0;
  }

  getTaskLimit(taskKey?: string): number {
    if (!taskKey) return Infinity;
    return this.taskLimits.get(taskKey) ?? Infinity;
  }

  canAcquire(taskKey?: string, customTaskLimit?: number): boolean {
    if (this.currentGlobalActive >= this.globalLimit) {
      return false;
    }

    if (taskKey) {
      const active = this.taskActive.get(taskKey) ?? 0;
      const limit = customTaskLimit ?? this.taskLimits.get(taskKey) ?? Infinity;
      if (active >= limit) {
        return false;
      }
    }

    return true;
  }

  acquire(taskKey?: string): () => void {
    this.currentGlobalActive++;
    if (taskKey) {
      this.taskActive.set(taskKey, (this.taskActive.get(taskKey) ?? 0) + 1);
    }

    let released = false;
    return () => {
      if (released) return;
      released = true;

      this.currentGlobalActive = Math.max(0, this.currentGlobalActive - 1);
      if (taskKey) {
        const count = this.taskActive.get(taskKey) ?? 1;
        if (count <= 1) {
          this.taskActive.delete(taskKey);
        } else {
          this.taskActive.set(taskKey, count - 1);
        }
      }
    };
  }

  reset(): void {
    this.currentGlobalActive = 0;
    this.taskActive.clear();
    this.taskLimits.clear();
  }
}
