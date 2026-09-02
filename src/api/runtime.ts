/**
 * createRuntime entrypoint function.
 */

import { TaskRuntime } from "../core/runtime.js";
import type { RuntimeOptions } from "../core/types.js";

/**
 * Creates and initializes a new TaskRuntime instance.
 */
export function createRuntime(options?: RuntimeOptions): TaskRuntime {
  return new TaskRuntime(options);
}
