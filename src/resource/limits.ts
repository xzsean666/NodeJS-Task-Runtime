/**
 * Resource limits and constraints for task executions.
 */

export interface ResourceLimits {
  /**
   * Maximum memory in Megabytes (e.g. 512 for 512MB).
   * For Worker Threads and Child Processes, this maps to `--max-old-space-size`.
   */
  maxMemoryMb?: number;

  /**
   * CPU quota or priority weight hint.
   */
  cpuQuota?: number;
}

/**
 * Validates and normalizes resource limit configurations.
 */
export function normalizeResourceLimits(limits?: ResourceLimits): ResourceLimits | undefined {
  if (!limits) {
    return undefined;
  }

  const normalized: ResourceLimits = {};

  if (typeof limits.maxMemoryMb === "number" && limits.maxMemoryMb > 0) {
    normalized.maxMemoryMb = Math.floor(limits.maxMemoryMb);
  }

  if (typeof limits.cpuQuota === "number" && limits.cpuQuota > 0) {
    normalized.cpuQuota = limits.cpuQuota;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}
