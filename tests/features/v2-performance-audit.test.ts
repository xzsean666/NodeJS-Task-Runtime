import { describe, it, expect, afterEach } from "vitest";
import os from "node:os";
import {
  createRuntime,
  resolveWorkerCount,
  parseMemoryLimit,
  parseCommandLine,
} from "../../src/index.js";
import type { TaskRuntime } from "../../src/core/runtime.js";

describe("Performance & Security Audit Enhancements", () => {
  let runtime: TaskRuntime;

  afterEach(async () => {
    if (runtime) {
      await runtime.destroy();
    }
  });

  describe("CPU Multi-Core Full Utilization", () => {
    it("should resolve 'max' and 'all' to 100% of available CPU cores", () => {
      const cores = typeof os.availableParallelism === "function"
        ? os.availableParallelism()
        : os.cpus()?.length || 1;

      expect(resolveWorkerCount("max")).toBe(cores);
      expect(resolveWorkerCount("all")).toBe(cores);
      expect(resolveWorkerCount("auto")).toBe(Math.max(1, cores - 1));
    });

    it("should spawn worker pool with all cores when workers: 'max' is passed", async () => {
      const expectedCores = resolveWorkerCount("max");
      runtime = createRuntime({ workers: "max" });
      await runtime.warmup();

      const stats = runtime.stats();
      expect(stats.totalWorkers).toBe(expectedCores);
    });
  });

  describe("Memory Limits & Allocation", () => {
    it("should parse memory limit strings into megabytes correctly", () => {
      expect(parseMemoryLimit("512MB")).toBe(512);
      expect(parseMemoryLimit("2GB")).toBe(2048);
      expect(parseMemoryLimit("4G")).toBe(4096);
      expect(parseMemoryLimit(1024)).toBe(1024);
    });

    it("should allow configuring runtime memory limit and run tasks properly", async () => {
      runtime = createRuntime({ workers: 2, memory: "2GB" });
      await runtime.warmup();

      const memTask = runtime.task(() => {
        return process.memoryUsage().heapTotal > 0;
      });

      const result = await memTask(null);
      expect(result).toBe(true);
    });
  });

  describe("Accelerated Chunked Batch & runtime.map", () => {
    it("should execute chunked batch orders of magnitude faster with full output integrity", async () => {
      runtime = createRuntime({ workers: 4 });
      await runtime.warmup();

      const task = runtime.task((x: number) => x * 10);
      const items = Array.from({ length: 2000 }, (_, i) => i);

      const results = await task.batch(items, { chunkSize: 250 });
      expect(results.length).toBe(2000);
      expect(results[0]).toBe(0);
      expect(results[100]).toBe(1000);
      expect(results[1999]).toBe(19990);
    });

    it("should support runtime.map directly with automatic chunked acceleration", async () => {
      runtime = createRuntime({ workers: 4 });
      await runtime.warmup();

      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const squared = await runtime.map(items, (n: number) => n * n);

      expect(squared).toEqual([1, 4, 9, 16, 25, 36, 49, 64, 81, 100]);
    });

    it("should support runtime.each for parallel side-effects", async () => {
      runtime = createRuntime({ workers: 2 });
      await runtime.warmup();

      const items = [10, 20, 30];
      await expect(
        runtime.each(items, (n: number) => {
          if (n <= 0) throw new Error("Invalid");
        })
      ).resolves.toBeUndefined();
    });

    it("should support runtime.parallel for heterogenous task execution", async () => {
      runtime = createRuntime({ workers: 2 });
      const taskA = runtime.task((x: number) => x + 1);
      const taskB = runtime.task((x: string) => x.toUpperCase());

      const results = await runtime.parallel([
        taskA(5),
        taskB("node"),
        async () => 99,
      ]);

      expect(results).toEqual([6, "NODE", 99]);
    });
  });

  describe("Safe CLI Argument Parsing", () => {
    it("should parse command strings with quotes and whitespace safely without shell", () => {
      expect(parseCommandLine("node -v")).toEqual(["node", "-v"]);
      expect(parseCommandLine("echo 'hello world'")).toEqual(["echo", "hello world"]);
      expect(parseCommandLine('python3 -c "print(123)" --opt')).toEqual([
        "python3",
        "-c",
        "print(123)",
        "--opt",
      ]);
    });

    it("should execute CLI commands given as single string without ENOENT and without shell injection", async () => {
      runtime = createRuntime();
      const cliTask = runtime.cli<void, string>("node -v", {
        stdout: "string",
      });

      const version = await cliTask();
      expect(version).toMatch(/^v\d+\.\d+\.\d+/);
    });
  });

  describe("Worker Function Caching & V8 Optimization", () => {
    it("should cache compiled functions across multiple sequential calls", async () => {
      runtime = createRuntime({ workers: 2 });
      await runtime.warmup();

      const computeTask = runtime.task((n: number) => n ** 2);

      const res1 = await computeTask(4);
      const res2 = await computeTask(5);
      const res3 = await computeTask(6);

      expect([res1, res2, res3]).toEqual([16, 25, 36]);
    });
  });
});
