import { describe, it, expect, afterEach } from "vitest";
import { createRuntime } from "../../src/index.js";
import type { TaskRuntime } from "../../src/core/runtime.js";

describe("task.batch and task.map", () => {
  let runtime: TaskRuntime;

  afterEach(async () => {
    if (runtime) {
      await runtime.destroy();
    }
  });

  it("should process items in batch with task.batch", async () => {
    runtime = createRuntime({ workers: 4 });

    const multiply = runtime.task((x: number) => x * 10, { name: "multiply10" });
    const inputs = [1, 2, 3, 4, 5];

    const results = await multiply.batch(inputs);
    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  it("should map over items with task.map", async () => {
    runtime = createRuntime({ workers: 4 });

    const uppercase = runtime.task((str: string) => str.toUpperCase(), { name: "uppercase" });
    const inputs = ["apple", "banana", "cherry"];

    const results = await uppercase.map(inputs);
    expect(results).toEqual(["APPLE", "BANANA", "CHERRY"]);
  });
});
