import { describe, it, expect, afterEach } from "vitest";
import { createRuntime } from "../../src/index.js";
import fs from "node:fs";

describe("v2-perfect-sdk", () => {
  let runtime = createRuntime({ workers: 2 });

  afterEach(async () => {
    await runtime.shutdown(1000);
    runtime = createRuntime({ workers: 2 });
  });

  describe("Managed Temp Files & Directories", () => {
    it("should create temp files and auto-clean them on error by default", async () => {
      let createdTempPath = "";

      const failingTask = runtime.task(
        async () => {
          throw new Error("Task intentionally failed");
        },
        {
          name: "temp-error-task",
          middlewares: [
            async (ctx, next) => {
              const tmpFile = ctx.createTempFile(".txt");
              createdTempPath = tmpFile;
              await fs.promises.writeFile(tmpFile, "temporary data");
              expect(fs.existsSync(tmpFile)).toBe(true);
              return next();
            },
          ],
        }
      );

      try {
        await failingTask(null);
        expect.unreachable("Task should have failed");
      } catch (err: any) {
        expect(err.message).toBe("Task intentionally failed");
      }

      // Small delay for async cleanup
      await new Promise((r) => setTimeout(r, 50));
      // Temp file should be automatically removed on failure
      expect(fs.existsSync(createdTempPath)).toBe(false);
    });

    it("should keep temp files on success by default unless autoCleanTemp is 'always'", async () => {
      let createdTempPath = "";

      const successTask = runtime.task(
        async () => "done",
        {
          name: "temp-success-task",
          middlewares: [
            async (ctx, next) => {
              const tmpFile = ctx.createTempFile(".data");
              createdTempPath = tmpFile;
              await fs.promises.writeFile(tmpFile, "persist me");
              return next();
            },
          ],
        }
      );

      await successTask(null);
      // Temp file should still exist for caller to read
      expect(fs.existsSync(createdTempPath)).toBe(true);
      await fs.promises.unlink(createdTempPath).catch(() => {});
    });

    it("should auto-clean temp files on success when autoCleanTemp is 'always'", async () => {
      let createdTempPath = "";

      const alwaysCleanTask = runtime.task(
        async () => "done",
        {
          name: "always-clean-task",
          autoCleanTemp: "always",
          middlewares: [
            async (ctx, next) => {
              const tmpFile = ctx.createTempFile(".clean");
              createdTempPath = tmpFile;
              await fs.promises.writeFile(tmpFile, "ephemeral data");
              return next();
            },
          ],
        }
      );

      await alwaysCleanTask(null);
      await new Promise((r) => setTimeout(r, 50));
      expect(fs.existsSync(createdTempPath)).toBe(false);
    });
  });

  describe("Context-Aware Dynamic CLI & Temp Files", () => {
    it("should support dynamic command and context-aware args creating temp output", async () => {
      let tempOut = "";

      const dynamicCli = runtime.cli<{ content: string }, string>(
        // Dynamic command resolver
        () => "node",
        {
          name: "dynamic-node-cli",
          args: (input, ctx) => {
            const outPath = ctx.createTempFile(".txt");
            tempOut = outPath;
            return [
              "-e",
              `require('node:fs').writeFileSync(${JSON.stringify(outPath)}, ${JSON.stringify(input.content)}); process.stdout.write('OK');`,
            ];
          },
          stdout: "string",
        }
      );

      const res = await dynamicCli({ content: "Hello from dynamic CLI" });
      expect(res.trim()).toBe("OK");
      expect(fs.existsSync(tempOut)).toBe(true);
      const readContent = await fs.promises.readFile(tempOut, "utf-8");
      expect(readContent).toBe("Hello from dynamic CLI");
      await fs.promises.unlink(tempOut).catch(() => {});
    });
  });

  describe("Worker Pool Warmup & Eager Prewarming", () => {
    it("should prewarm worker pool using runtime.warmup()", async () => {
      const warmupRuntime = createRuntime({ workers: 3 });
      expect(warmupRuntime.stats().totalWorkers).toBe(0); // lazy before warmup

      await warmupRuntime.warmup();
      const stats = warmupRuntime.stats();
      expect(stats.totalWorkers).toBe(3);
      expect(stats.idleWorkers).toBe(3);

      await warmupRuntime.shutdown();
    });

    it("should eagerly initialize workers when eager: true is specified", async () => {
      const eagerRuntime = createRuntime({ workers: 2, eager: true });
      // Allow a brief moment for eager async spawn
      await new Promise((r) => setTimeout(r, 100));

      const stats = eagerRuntime.stats();
      expect(stats.totalWorkers).toBe(2);

      await eagerRuntime.shutdown();
    });
  });

  describe("Active Tasks Inspector (runtime.getActiveTasks)", () => {
    it("should return snapshots of currently executing tasks", async () => {
      const slowTask = runtime.task(
        async () => {
          await new Promise((r) => setTimeout(r, 150));
          return "slow-done";
        },
        { name: "slow-inspect-task" }
      );

      const execPromise = slowTask(null);

      // Wait 30ms for task to start
      await new Promise((r) => setTimeout(r, 30));

      const activeTasks = runtime.getActiveTasks();
      expect(activeTasks.length).toBeGreaterThanOrEqual(1);
      const found = activeTasks.find((t) => t.taskName === "slow-inspect-task");
      expect(found).toBeDefined();
      expect(found?.status).toBe("running");
      expect(found?.durationMs).toBeGreaterThan(0);

      await execPromise;
      expect(runtime.getActiveTasks().length).toBe(0);
    });
  });
});
