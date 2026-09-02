import { describe, it, expect } from "vitest";
import { serializeJson, parseJson } from "../../src/transport/json.js";
import { toBuffer } from "../../src/transport/binary.js";
import { formatOutput } from "../../src/transport/protocol.js";

describe("Transport protocols", () => {
  it("should serialize and parse JSON", () => {
    const data = { hello: "world", count: 123 };
    const str = serializeJson(data);
    expect(parseJson(str)).toEqual(data);
  });

  it("should convert inputs to Buffer", () => {
    expect(toBuffer("hello")).toEqual(Buffer.from("hello"));
    expect(toBuffer(null)).toEqual(Buffer.alloc(0));
    expect(toBuffer(Buffer.from("test"))).toEqual(Buffer.from("test"));
  });

  it("should format outputs according to data format", () => {
    const jsonBuf = Buffer.from(JSON.stringify({ status: "ok" }));
    expect(formatOutput(jsonBuf, "json")).toEqual({ status: "ok" });

    const strBuf = Buffer.from("  raw text  \n");
    expect(formatOutput(strBuf, "string")).toBe("raw text");

    const binBuf = Buffer.from([1, 2, 3]);
    expect(formatOutput(binBuf, "binary")).toEqual(binBuf);

    expect(formatOutput(binBuf, "ignore")).toBeUndefined();
  });
});
