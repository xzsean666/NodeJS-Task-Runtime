import { describe, it, expect } from "vitest";
import { createLinkedAbortController } from "../../src/execution/cancellation.js";

describe("createLinkedAbortController", () => {
  it("should abort child when parent signal aborts", () => {
    const parent = new AbortController();
    const { controller, cleanup } = createLinkedAbortController(parent.signal);

    expect(controller.signal.aborted).toBe(false);
    parent.abort("Parent aborted");
    expect(controller.signal.aborted).toBe(true);

    cleanup();
  });

  it("should handle already aborted parent signal", () => {
    const parent = new AbortController();
    parent.abort("Already aborted");

    const { controller } = createLinkedAbortController(parent.signal);
    expect(controller.signal.aborted).toBe(true);
  });

  it("should handle multiple parent signals", () => {
    const p1 = new AbortController();
    const p2 = new AbortController();
    const { controller } = createLinkedAbortController(p1.signal, p2.signal);

    expect(controller.signal.aborted).toBe(false);
    p2.abort("P2 aborted");
    expect(controller.signal.aborted).toBe(true);
  });
});
