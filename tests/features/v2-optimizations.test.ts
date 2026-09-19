import { describe, it, expect, afterEach } from "vitest";
import { createRuntime, RuntimeError, RuntimeErrorCode } from "../../src/index.js";

describe("v2-optimizations", () => {
  let runtime = createRuntime({ workers: 2 });

  afterEach(async () => {
    await runtime.shutdown(1000);
    runtime = createRuntime({ workers: 2 });
  });

  describe("Transferable Objects Support (Zero-Copy Worker Threads)", () => {
    it("should support passing and receiving ArrayBuffer with transferList", async () => {
      const bufferTask = runtime.task(
        (input: { buffer: ArrayBuffer }) => {
          const view = new Uint8Array(input.buffer);
          // Mutate buffer
          for (let i = 0; i < view.length; i++) {
            view[i] = (view[i] + 10) & 0xff;
          }
          return input.buffer;
        },
        { name: "buffer-task" }
      );

      const u8 = new Uint8Array([1, 2, 3, 4, 5]);
      const originalBuffer = u8.buffer;

      const result = await bufferTask(
        { buffer: originalBuffer },
        { transferList: [originalBuffer] }
      );

      expect(result).toBeInstanceOf(ArrayBuffer);
      const resView = new Uint8Array(result);
      expect(Array.from(resView)).toEqual([11, 12, 13, 14, 15]);
      // In sender thread, transferred buffer becomes detached (byteLength 0)
      expect(originalBuffer.byteLength).toBe(0);
    });
  });

  describe("Worker Threads Closure Reference Diagnostic Hint", () => {
    it("should provide diagnostic hint when inline function accesses undefined closure variable", async () => {
      // In worker thread, 'nonExistentVariable' is not defined
      const faultyTask = runtime.task(
        () => {
          // @ts-ignore
          return nonExistentVariable + 1;
        },
        { name: "faulty-closure" }
      );

      try {
        await faultyTask(null);
        expect.unreachable("Should have thrown ReferenceError");
      } catch (err: any) {
        expect(err.message).toContain("nonExistentVariable is not defined");
        expect(err.message).toContain(
          "Hint: Inline functions in Worker Threads cannot access outer scope variables"
        );
      }
    });
  });

  describe("CLI & Process maxBuffer Overflow & Streaming Hooks", () => {
    it("should reject with BUFFER_OVERFLOW when CLI output exceeds maxBuffer", async () => {
      // Generate output larger than 100 bytes
      const bigOutputCli = runtime.cli("node", {
        name: "big-output",
        args: ["-e", "process.stdout.write('A'.repeat(500))"],
        maxBuffer: 100, // 100 bytes limit
      });

      try {
        await bigOutputCli(null);
        expect.unreachable("Should have rejected due to buffer overflow");
      } catch (err: any) {
        expect(RuntimeError.isRuntimeError(err)).toBe(true);
        expect(err.code).toBe(RuntimeErrorCode.BUFFER_OVERFLOW);
        expect(err.message).toContain("exceeded maximum buffer limit of 100 bytes");
      }
    });

    it("should invoke onStdout and onStderr streaming hooks in real-time", async () => {
      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];

      const streamCli = runtime.cli("node", {
        name: "streaming-cli",
        args: [
          "-e",
          "process.stdout.write('chunk1\\n'); process.stderr.write('err1\\n'); process.stdout.write('chunk2\\n');",
        ],
        stdout: "string",
        onStdout: (chunk) => stdoutChunks.push(chunk.toString()),
        onStderr: (chunk) => stderrChunks.push(chunk.toString()),
      });

      const res = await streamCli(null);
      expect(typeof res).toBe("string");
      expect(stdoutChunks.join("")).toContain("chunk1\nchunk2\n");
      expect(stderrChunks.join("")).toContain("err1\n");
    });
  });

  describe("Deep Pipeline Chaining & Type Safety", () => {
    it("should execute a 6-stage pipeline smoothly", async () => {
      const step1 = runtime.task((x: number) => x + 1, { name: "add1" });
      const step2 = runtime.task((x: number) => x * 2, { name: "mul2" });
      const step3 = (x: number) => `value: ${x}`;
      const step4 = runtime.task((s: string) => s.toUpperCase(), { name: "upper" });
      const step5 = (s: string) => ({ message: s, length: s.length });
      const step6 = runtime.task((o: { message: string; length: number }) => o.length, {
        name: "len",
      });

      const fullPipeline = runtime.pipeline(step1, step2, step3, step4, step5, step6);

      // (5 + 1) = 6 -> * 2 = 12 -> "value: 12" -> "VALUE: 12" -> length = 9
      const result = await fullPipeline(5);
      expect(result).toBe(9);
    });
  });
});
