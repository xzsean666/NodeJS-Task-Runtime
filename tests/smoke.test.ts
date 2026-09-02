import { describe, it, expect } from "vitest";
import { VERSION } from "../src/index.js";

describe("Smoke Test", () => {
  it("should have valid VERSION", () => {
    expect(VERSION).toBe("0.1.0");
  });
});
