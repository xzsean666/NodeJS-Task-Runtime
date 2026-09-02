/**
 * Retry controller with configurable backoff strategies (fixed, linear, exponential).
 */

import type { RetryOptions } from "../core/types.js";
import { RuntimeError } from "./error.js";

export function normalizeRetryOptions(retry?: number | RetryOptions): RetryOptions | undefined {
  if (retry === undefined || retry === null) {
    return undefined;
  }

  if (typeof retry === "number") {
    if (retry <= 1) return undefined;
    return {
      attempts: Math.floor(retry),
      backoff: "exponential",
      delay: 100,
      maxDelay: 30000,
    };
  }

  if (typeof retry === "object" && retry.attempts > 1) {
    return {
      attempts: Math.floor(retry.attempts),
      backoff: retry.backoff ?? "exponential",
      delay: retry.delay ?? 100,
      maxDelay: retry.maxDelay ?? 30000,
      retryIf: retry.retryIf,
    };
  }

  return undefined;
}

export function calculateBackoffDelay(attempt: number, options: RetryOptions): number {
  const baseDelay = Math.max(0, options.delay ?? 100);
  const maxDelay = Math.max(baseDelay, options.maxDelay ?? 30000);
  const strategy = options.backoff ?? "exponential";

  let delay = baseDelay;
  if (strategy === "fixed") {
    delay = baseDelay;
  } else if (strategy === "linear") {
    delay = baseDelay * attempt;
  } else if (strategy === "exponential") {
    delay = baseDelay * Math.pow(2, attempt - 1);
  }

  return Math.min(delay, maxDelay);
}

export interface RetryEvent {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  error: RuntimeError;
}

export async function withRetry<T>(
  action: (attempt: number) => Promise<T>,
  options?: RetryOptions,
  onRetry?: (event: RetryEvent) => void,
  signal?: AbortSignal
): Promise<T> {
  const normalized = normalizeRetryOptions(options);
  if (!normalized || normalized.attempts <= 1) {
    return action(1);
  }

  const maxAttempts = normalized.attempts;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (signal?.aborted) {
        throw RuntimeError.cancelled(String(signal.reason ?? "Task cancelled before retry attempt"));
      }
      return await action(attempt);
    } catch (err: unknown) {
      const runtimeErr = RuntimeError.from(err, { retryCount: attempt - 1 });

      // Never retry cancelled tasks
      if (runtimeErr.cancelled || signal?.aborted) {
        throw runtimeErr;
      }

      // Check custom predicate if provided
      if (normalized.retryIf && !normalized.retryIf(runtimeErr)) {
        throw runtimeErr;
      }

      // If we exhausted all attempts, throw the error
      if (attempt >= maxAttempts) {
        throw runtimeErr;
      }

      const delayMs = calculateBackoffDelay(attempt, normalized);

      if (onRetry) {
        onRetry({
          attempt,
          maxAttempts,
          delayMs,
          error: runtimeErr,
        });
      }

      if (delayMs > 0) {
        if (signal?.aborted) {
          throw RuntimeError.cancelled(String(signal.reason ?? "Task cancelled during retry delay"));
        }
        await new Promise<void>((resolve, reject) => {
          let timer: NodeJS.Timeout | undefined;
          const onAbort = () => {
            if (timer) clearTimeout(timer);
            reject(RuntimeError.cancelled(String(signal?.reason ?? "Task cancelled during retry delay")));
          };
          if (signal) {
            signal.addEventListener("abort", onAbort, { once: true });
          }
          timer = setTimeout(() => {
            if (signal) {
              signal.removeEventListener("abort", onAbort);
            }
            resolve();
          }, delayMs);
        });
      }
    }
  }

  throw new Error("Unreachable retry loop termination");
}
