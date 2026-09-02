import { describe, it, expect } from "vitest";
import { parseMemoryLimit, toNodeMaxOldSpaceSizeArg } from "../../src/resource/memory.js";

describe("parseMemoryLimit", () => {
  it("should parse number and string representations of memory limits", () => {
    expect(parseMemoryLimit(512)).toBe(512);
    expect(parseMemoryLimit("512MB")).toBe(512);
    expect(parseMemoryLimit("512M")).toBe(512);
    expect(parseMemoryLimit("1GB")).toBe(1024);
    expect(parseMemoryLimit("1G")).toBe(1024);
    expect(parseMemoryLimit("2048KB")).toBe(2);
    expect(parseMemoryLimit("invalid")).toBe(0);
  });

  it("should generate Node.js max-old-space-size CLI flag", () => {
    expect(toNodeMaxOldSpaceSizeArg(512)).toBe("--max-old-space-size=512");
    expect(toNodeMaxOldSpaceSizeArg(0)).toBeUndefined();
  });
});
