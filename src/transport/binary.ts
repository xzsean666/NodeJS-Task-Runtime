import { serializeJson } from "./json.js";

export function toBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (data instanceof Uint8Array) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  if (typeof data === "string") {
    return Buffer.from(data, "utf-8");
  }
  if (data === null || data === undefined) {
    return Buffer.alloc(0);
  }
  return Buffer.from(serializeJson(data), "utf-8");
}
