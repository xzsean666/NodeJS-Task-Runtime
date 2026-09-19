/**
 * Timeout control wrapper for task executions.
 */

import { RuntimeError } from "./error.js";

export interface TimeoutOptions {
  timeoutMs: number;
  taskId?: string;
  executionId?: string;
  executor?: any;
  onTimeout?: () => void | Promise<void>;
}

export async function withTimeout<T>(
  action: (signal: AbortSignal) => Promise<T>,
  options: TimeoutOptions
): Promise<T> {
  const { timeoutMs, taskId, executionId, executor, onTimeout } = options;

  if (!timeoutMs || timeoutMs <= 0) {
    const controller = new AbortController();
    return action(controller.signal);
  }

  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(async () => {
      controller.abort("Execution timed out");
      if (onTimeout) {
        try {
          await onTimeout();
        } catch {
          // ignore
        }
      }
      reject(
        RuntimeError.timeout(timeoutMs, {
          taskId,
          executionId,
          executor,
        })
      );
    }, timeoutMs);
  });

  try {
    const actionPromise = action(controller.signal);
    // Attach noop catch to suppress UnhandledPromiseRejection if action rejects after timeout wins
    actionPromise.catch(() => {});
    const result = await Promise.race([actionPromise, timeoutPromise]);
    return result;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
