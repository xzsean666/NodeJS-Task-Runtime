/**
 * Metrics collector tracking runtime task executions, status counts, and execution durations.
 */

import type { RuntimeStats } from "../core/types.js";
import type { RuntimeEventEmitter } from "./events.js";

export class MetricsCollector {
  private totalTasks = 0;
  private completedTasks = 0;
  private failedTasks = 0;
  private cancelledTasks = 0;
  private timedOutTasks = 0;
  private retriedTasks = 0;
  private queuedTasks = 0;
  private activeExecutions = 0;
  private totalDurationMs = 0;

  constructor(eventEmitter?: RuntimeEventEmitter) {
    if (eventEmitter) {
      this.bindEvents(eventEmitter);
    }
  }

  private bindEvents(events: RuntimeEventEmitter): void {
    events.on("task:queued", () => {
      this.totalTasks++;
      this.queuedTasks++;
    });

    events.on("task:start", () => {
      this.queuedTasks = Math.max(0, this.queuedTasks - 1);
      this.activeExecutions++;
    });

    events.on("task:complete", (e) => {
      this.activeExecutions = Math.max(0, this.activeExecutions - 1);
      this.completedTasks++;
      this.totalDurationMs += e.durationMs;
    });

    events.on("task:error", (e) => {
      this.activeExecutions = Math.max(0, this.activeExecutions - 1);
      this.failedTasks++;
      this.totalDurationMs += e.durationMs;
      if (e.error.timeout) {
        this.timedOutTasks++;
      }
    });

    events.on("task:timeout", () => {
      // task:timeout metric will be accounted when task:error fires or if standalone
    });

    events.on("task:cancel", (e) => {
      this.cancelledTasks++;
      if (e.stage === "queued") {
        this.queuedTasks = Math.max(0, this.queuedTasks - 1);
      } else if (e.stage === "running") {
        this.activeExecutions = Math.max(0, this.activeExecutions - 1);
      } else {
        if (this.queuedTasks > 0) {
          this.queuedTasks--;
        } else if (this.activeExecutions > 0) {
          this.activeExecutions--;
        }
      }
    });

    events.on("task:retry", () => {
      this.retriedTasks++;
    });
  }

  getStats(workerStats?: { active?: number; idle?: number; total?: number }): RuntimeStats {
    const finishedTasks = this.completedTasks + this.failedTasks;
    const avgDuration = finishedTasks > 0 ? this.totalDurationMs / finishedTasks : 0;

    return {
      totalTasks: this.totalTasks,
      completedTasks: this.completedTasks,
      failedTasks: this.failedTasks,
      cancelledTasks: this.cancelledTasks,
      timedOutTasks: this.timedOutTasks,
      retriedTasks: this.retriedTasks,
      activeExecutions: this.activeExecutions,
      queuedTasks: this.queuedTasks,
      activeWorkers: workerStats?.active ?? 0,
      idleWorkers: workerStats?.idle ?? 0,
      totalWorkers: workerStats?.total ?? 0,
      averageDurationMs: Math.round(avgDuration * 100) / 100,
    };
  }

  reset(): void {
    this.totalTasks = 0;
    this.completedTasks = 0;
    this.failedTasks = 0;
    this.cancelledTasks = 0;
    this.timedOutTasks = 0;
    this.retriedTasks = 0;
    this.queuedTasks = 0;
    this.activeExecutions = 0;
    this.totalDurationMs = 0;
  }
}
