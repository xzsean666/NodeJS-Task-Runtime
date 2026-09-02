import { describe, it, expect } from "vitest";
import { normalizeResourceLimits } from "../../src/resource/limits.js";

describe("ResourceLimits", () => {
  it("should normalize valid resource limits", () => {
    const limits = normalizeResourceLimits({
      maxMemoryMb: 512.5,
      cpuQuota: 0.5,
    });

    expect(limits).toEqual({
      maxMemoryMb: 512,
      cpuQuota: 0.5,
    });
  });

  it("should return undefined for empty or invalid limits", () => {
    expect(normalizeResourceLimits()).toBeUndefined();
    expect(normalizeResourceLimits({})).toBeUndefined();
    expect(normalizeResourceLimits({ maxMemoryMb: -10 })).toBeUndefined();
    expect(normalizeResourceLimits({ cpuQuota: 0 })).toBeUndefined();
  });
});
