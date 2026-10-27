/**
 * CPU and worker count detection with auto-adaptive sizing.
 */

import os from "node:os";

export type WorkerCountOption = number | "auto" | "max" | "all";

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
 * Resolves configured worker count, supporting 'auto', 'max' / 'all' (100% of cores), or explicit number.
 */
export function resolveWorkerCount(workers?: WorkerCountOption): number {
  if (typeof workers === "number" && workers > 0) {
    return Math.floor(workers);
  }
  if (workers === "max" || workers === "all") {
    return typeof os.availableParallelism === "function"
      ? os.availableParallelism()
      : os.cpus()?.length || 1;
  }
  return getAutoWorkerCount();
}
