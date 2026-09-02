/**
 * Stdio and stream protocol formatting and decoding.
 */

import type { Writable } from "node:stream";
import type { DataFormat } from "../core/types.js";
import { serializeJson, parseJson } from "./json.js";
import { toBuffer } from "./binary.js";

export function writeToStdin(
  stdin: Writable,
  input: unknown,
  format: "json" | "string" | "binary" | "pipe" = "json"
): void {
  if (input === undefined || input === null) {
    stdin.end();
    return;
  }

  if (format === "json") {
    const serialized = typeof input === "string" ? input : serializeJson(input);
    stdin.write(serialized);
  } else if (format === "string") {
    stdin.write(typeof input === "string" ? input : String(input));
  } else if (format === "binary") {
    stdin.write(toBuffer(input));
  } else if (format === "pipe") {
    if (typeof (input as any).pipe === "function") {
      (input as any).pipe(stdin);
      return;
    }
    stdin.write(toBuffer(input));
  }

  stdin.end();
}

export function formatOutput<T = unknown>(
  buffer: Buffer,
  format: DataFormat = "json"
): T {
  if (format === "ignore") {
    return undefined as unknown as T;
  }

  if (format === "binary") {
    return buffer as unknown as T;
  }

  const text = buffer.toString("utf-8").trim();

  if (format === "string") {
    return text as unknown as T;
  }

  if (format === "json") {
    if (text === "") {
      return undefined as unknown as T;
    }
    return parseJson<T>(text);
  }

  return text as unknown as T;
}
