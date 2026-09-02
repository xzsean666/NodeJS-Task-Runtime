/**
 * JSON serialization and parsing helpers.
 */

import { RuntimeError, RuntimeErrorCode } from "../execution/error.js";

export function serializeJson(data: unknown): string {
  try {
    return JSON.stringify(data);
  } catch (err) {
    throw new RuntimeError({
      code: RuntimeErrorCode.SERIALIZATION_ERROR,
      message: `Failed to serialize JSON input: ${err instanceof Error ? err.message : String(err)}`,
      cause: err,
    });
  }
}

export function parseJson<T = unknown>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new RuntimeError({
      code: RuntimeErrorCode.SERIALIZATION_ERROR,
      message: `Failed to parse JSON output: ${err instanceof Error ? err.message : String(err)}`,
      cause: err,
    });
  }
}
