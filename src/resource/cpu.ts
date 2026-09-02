/**
 * CPU and worker count detection with auto-adaptive sizing.
 */

import os from "node:os";

/**
 * Returns the recommended number of worker threads for the current machine.
 * Adheres to DECISION-004: Math.max(1, availableParallelism - 1) to leave
 * at least 1 core for the main event loop and I/O.
 */
export function getAutoWorkerCount(): number {
  let cores = 1;
  if (typeof os.availableParallelism === "function") {
    cores = os.availableParallelism();
  } else {
    cores = os.cpus()?.length || 1;
  }
  return Math.max(1, cores - 1);
}

/**
 * Resolves configured worker count, supporting 'auto' or explicit number.
 */
export function resolveWorkerCount(workers?: number | "auto"): number {
  if (typeof workers === "number" && workers > 0) {
    return Math.floor(workers);
  }
  return getAutoWorkerCount();
}
