import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import {
  createRuntime,
  TaskRuntimeModule,
  TASK_RUNTIME,
  normalizeTransferList,
  RuntimeError,
} from "../../src/index.js";
import type { TaskRuntime } from "../../src/core/runtime.js";

describe("Traps Avoidance & Enterprise Optimizations", () => {
  let runtime: TaskRuntime;
  const tempFiles: string[] = [];

  afterEach(async () => {
    if (runtime) {
      await runtime.destroy();
    }
    for (const f of tempFiles) {
      try {
        fs.unlinkSync(f);
      } catch {}
    }
    tempFiles.length = 0;
  });

  describe("Trap 1: Binary Zero-Copy & TransferList Auto-Normalization", () => {
    it("should auto-normalize standalone Buffer and TypedArray to ArrayBuffer in transferList without DataCloneError", () => {
      const buf = Buffer.alloc(512, 0xaa);
      const u8 = new Uint8Array([1, 2, 3, 4]);

      const normalized = normalizeTransferList([buf, u8, buf.buffer]);
      expect(normalized.length).toBe(2); // buf.buffer deduplicated, u8.buffer included
      expect(normalized[0] instanceof ArrayBuffer).toBe(true);
      expect(normalized[1] instanceof ArrayBuffer).toBe(true);
    });

    it("should execute task with Buffer in transferList without throwing DataCloneError", async () => {
      runtime = createRuntime({ workers: 2 });
      await runtime.warmup();

      const task = runtime.task((buf: ArrayBuffer) => {
        return buf.byteLength;
      });

      const buffer = Buffer.alloc(256);
      // Passing Buffer directly in transferList:
      const result = await task(buffer.buffer, { transferList: [buffer] });
      expect(result).toBe(256);
    });

    it("should automatically zero-copy transfer standalone Buffer returned from Worker", async () => {
      runtime = createRuntime({ workers: 2 });
      await runtime.warmup();

      const task = runtime.task(() => {
        // Return standalone Buffer
        const b = Buffer.alloc(1024, 42);
        return b;
      });

      const res = await task(null);
      expect(Buffer.isBuffer(res) || res instanceof Uint8Array).toBe(true);
      expect((res as any).byteLength).toBe(1024);
      expect((res as any)[0]).toBe(42);
    });
  });

  describe("Trap 2: TypeScript Transpiler Helper Shims (__awaiter, __generator)", () => {
    it("should seamlessly execute functions referencing transpiled __awaiter and __generator in worker", async () => {
      runtime = createRuntime({ workers: 2 });
      await runtime.warmup();

      // Simulate TypeScript compiled output using __awaiter & __generator
      const transpiledCode = `
        function () {
          return __awaiter(this, void 0, void 0, function* () {
            const val = yield Promise.resolve(12345);
            return val * 2;
          });
        }
      `;

      const task = runtime.task(transpiledCode);
      const result = await task(null);
      expect(result).toBe(24690);
    });
  });

  describe("Trap 3: Worker Recycling & Anti-Memory Creep (maxTasksPerWorker)", () => {
    it("should gracefully recycle worker threads after maxTasksPerWorker reached", async () => {
      // Set worker count = 1, maxTasksPerWorker = 2
      runtime = createRuntime({ workers: 1, maxTasksPerWorker: 2 });
      await runtime.warmup();

      let spawnCount = 0;
      runtime.on("worker:spawn", () => {
        spawnCount++;
      });

      const task = runtime.task((n: number) => n + 1);

      // Task 1: executed by worker 1 (tasksExecuted = 1)
      const res1 = await task(10);
      expect(res1).toBe(11);
      expect(spawnCount).toBe(0); // initial warmup worker already spawned

      // Task 2: executed by worker 1 (tasksExecuted = 2 -> trigger recycle)
      const res2 = await task(20);
      expect(res2).toBe(21);

      // Wait a short tick for replacement worker to be spawned
      await new Promise((r) => setTimeout(r, 60));
      expect(spawnCount).toBe(1); // 1 replacement worker spawned

      // Task 3: executed by replacement worker
      const res3 = await task(30);
      expect(res3).toBe(31);
    });
  });

  describe("Trap 4: File-Based Module Task (runtime.task(filePath))", () => {
    it("should successfully execute a task defined in an external JS file via modulePath", async () => {
      runtime = createRuntime({ workers: 2 });
      await runtime.warmup();

      const workerFilePath = path.join(os.tmpdir(), `test_worker_${Date.now()}_${Math.random().toString(36).slice(2)}.cjs`);
      tempFiles.push(workerFilePath);
      fs.writeFileSync(
        workerFilePath,
        `module.exports = function(input) { return input.val.toUpperCase() + "_PROCESSED"; };`
      );

      const fileTask = runtime.task<{ val: string }, string>(workerFilePath);
      const res = await fileTask({ val: "nestjs_task" });
      expect(res).toBe("NESTJS_TASK_PROCESSED");
    });
  });

  describe("Trap 5: NestJS Module Integration (TaskRuntimeModule)", () => {
    it("should configure dynamic module via TaskRuntimeModule.forRoot()", () => {
      const dynamicModule = TaskRuntimeModule.forRoot({
        workers: 4,
        isGlobal: true,
        maxTasksPerWorker: 1000,
      });

      expect(dynamicModule.global).toBe(true);
      expect(dynamicModule.providers.length).toBe(1);
      expect(dynamicModule.providers[0].provide).toBe(TASK_RUNTIME);

      const createdRuntime = dynamicModule.providers[0].useFactory();
      expect(createdRuntime).toBeDefined();
      expect(createdRuntime.options.workers).toBe(4);
      expect(createdRuntime.options.maxTasksPerWorker).toBe(1000);
      createdRuntime.destroy();
    });

    it("should configure dynamic module via TaskRuntimeModule.forRootAsync()", async () => {
      const dynamicModule = TaskRuntimeModule.forRootAsync({
        isGlobal: false,
        useFactory: async () => ({
          workers: 2,
          defaultTimeout: 5000,
        }),
      });

      expect(dynamicModule.global).toBe(false);
      const createdRuntime = await dynamicModule.providers[0].useFactory();
      expect(createdRuntime.options.workers).toBe(2);
      expect(createdRuntime.options.defaultTimeout).toBe(5000);
      await createdRuntime.destroy();
    });
  });

  describe("Trap 6: CLI ENOENT Actionable Diagnostic Hint", () => {
    it("should provide actionable hint when a CLI binary executable is not found", async () => {
      runtime = createRuntime();
      const nonExistent = runtime.cli("definitely_non_existent_binary_xyz_123");

      await expect(nonExistent(null)).rejects.toSatisfy((err: unknown) => {
        expect(RuntimeError.isRuntimeError(err)).toBe(true);
        if (RuntimeError.isRuntimeError(err)) {
          expect(err.message).toContain("Hint: Executable 'definitely_non_existent_binary_xyz_123' was not found");
        }
        return true;
      });
    });
  });
});
