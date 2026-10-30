---
name: node-task-runtime-expert
description: Expert skill for architecting, developing, maintaining, and integrating the Node.js Task Runtime (SDK) across Worker Threads, Child Processes, CLI binaries, and NestJS backends.
---

# Node.js Task Runtime Expert Skill

This skill provides comprehensive architectural guidance, operational protocols, best practices, and anti-pattern avoidance for working with the **Node.js Task Runtime SDK** (`node-task-runtime`).

---

## 1. Core Philosophy & Mental Model

> **"Hide the Execution, Expose the Task."**
> Developers define and call standard async tasks: `const result = await task(input)`. The runtime orchestrates worker pool dispatching, CPU affinity, priority queues, backpressure, retries, cancellation, and auto-healing.

### Execution Backend Selection Matrix

| Executor | Target Scenarios | Latency | Memory Limit | Shell Injection Risk |
| :--- | :--- | :--- | :--- | :--- |
| **`thread`** (Default) | In-process pure CPU-bound tasks, algorithms, crypto, array transformations | Microseconds (Pooled) | Bounded by V8 Isolate (`memory`) | None (`eval` in isolated V8) |
| **`cli`** | External binaries (FFmpeg, ImageMagick, Pandoc, Rust/Go utilities, Shell) | ~10-30ms (Spawn) | Unbounded (OS physical RAM) | Guarded (`shell: false`, quote parser) |
| **`process`** | High-risk, un-sandboxed Node.js tasks requiring complete process isolation | ~50-150ms (Cold spawn) | Configurable via `--max-old-space-size` | None |

---

## 2. Source Code Architecture

```text
src/
├── api/             # Developer-facing factory functions (createRuntime)
├── core/            # Runtime lifecycle, TaskCallable, ExecutionContext, unified types
├── executors/       
│   ├── thread/      # WorkerPool, Worker Threads dispatching, worker-runtime code
│   ├── cli/         # CLI command execution, stdio streaming, parseCommandLine
│   └── process/     # Node.js child-process executor
├── scheduler/       # PriorityQueue (min-max binary heap), ConcurrencyLimiter, TaskScheduler
├── execution/       # withTimeout, withRetry (Full Jitter), Cancellation, RuntimeError
├── resource/        # CPU auto-sensing (cores - 1), memory limit parser, limits
├── integrations/    # NestJS dynamic module (TaskRuntimeModule, TASK_RUNTIME token)
├── transport/       # Protocol serialization (JSON, Binary Buffer, Stdio streaming)
└── observability/   # RuntimeEventEmitter, MetricsCollector, Logger adapters
```

---

## 3. High-Priority Traps & Prevention Guidelines

When developing features, fixing bugs, or assisting developers using this SDK, **ALWAYS enforce the following rules**:

### ⚠️ Trap 1: Closure Loss in Inline Worker Tasks
- **The Issue**: Functions passed as `runtime.task(async () => ...)` are serialized to string and evaluated inside worker threads. They **CANNOT** capture outer variables, `this`, or imported modules.
- **Enforced Pattern**:
  - Always pass dependencies explicitly via the task's `input` parameter:
    ```typescript
    // ❌ WRONG: ReferenceError: secretKey is not defined
    const sign = runtime.task((data) => hash(data, secretKey));

    // ✅ CORRECT: Explicit input payload
    const sign = runtime.task(({ data, secretKey }) => hash(data, secretKey));
    await sign({ data, secretKey });
    ```
  - For complex tasks with external npm dependencies, use the **File-Based Module Pattern**:
    ```typescript
    const workerTask = runtime.task(path.resolve(__dirname, "./workers/heavy.worker.cjs"));
    ```

### ⚠️ Trap 2: TypeScript Transpiler Helper Shims (`__awaiter`, `__generator`)
- **The Issue**: Compilers (`tsc`, `swc`, `babel`) targeting older ES versions transform `async/await` into `__awaiter` and `__generator` calls referencing outer scope variables.
- **Built-in Guard**: [worker-runtime.ts](file:///ssd0/git/NodeJS-Task-Runtime/src/executors/thread/worker-runtime.ts) provides standard shims on `globalThis` for `__awaiter` and `__generator`. Maintain these shims in any worker runtime updates.

### ⚠️ Trap 3: Binary Buffer Zero-Copy & Shared Pool Detachment
- **The Issue**: In Node.js, `Buffer.from(...)` is allocated from an 8KB shared pool (`FastBuffer`). Transferring pooled buffer references throws `DataCloneError: Cannot transfer object of unsupported type`.
- **Built-in Guard**:
  - Always use `normalizeTransferList()` before transferring.
  - Only standalone views (`byteOffset === 0 && byteLength === buffer.byteLength`) or pure `ArrayBuffer` instances can be transferred via `transferList`. Sliced pooled buffers must fall back to structured cloning.

### ⚠️ Trap 4: Worker Memory Accumulation & Leaks
- **The Issue**: In 24/7 backend processes (NestJS), workers running indefinite tasks accumulate V8 heap fragmentation and module-level caches.
- **Built-in Guard**:
  - Configure `maxTasksPerWorker` (e.g. `1000` to `5000`) in `RuntimeOptions`.
  - [WorkerPool](file:///ssd0/git/NodeJS-Task-Runtime/src/executors/thread/pool.ts) will automatically retire and recreate idle workers when the execution threshold is reached.
  - Worker string function cache (`fnCache`) must adhere to LRU eviction capped at 500 entries.

### ⚠️ Trap 5: High-Frequency Process Spawning Anti-Pattern
- **The Issue**: Spawning OS processes (`ProcessExecutor`) incurs a 50-150ms startup penalty.
- **Rule**: Never use `executor: 'process'` for high-throughput microtasks. Use `thread` for Node.js tasks and `cli` with `concurrency` bounds for external binaries.

### ⚠️ Trap 6: CLI Command Injection & Zombie Processes
- **The Issue**: Shell string concatenation allows shell injection attacks (`| bash`, `; rm -rf`). Long-running CLI tools can become orphaned zombie processes.
- **Built-in Guard**:
  - `CLIExecutor` strictly enforces `shell: false` and uses [parseCommandLine](file:///ssd0/git/NodeJS-Task-Runtime/src/executors/cli/process.ts#L24-L62).
  - Timeouts and cancellations always perform two-stage termination: `SIGTERM` followed by `SIGKILL` after a 1000ms grace period with `unref()` timers.
  - Output stdout/stderr streams are guarded by `maxBuffer` (default 10MB) to prevent OOM.

---

## 4. NestJS Backend Integration Best Practices

### Architectural Golden Rule:
> **"Do I/O on the main thread; do pure computation in Worker threads."**
> Never inject TypeORM Repositories, Prisma Clients, or DB connection pools into worker threads. Query data on the main thread, pass raw POJO / Buffer to the worker, and receive the computed result.

### Standard Module Registration
```typescript
import { Module } from "@nestjs/common";
import { TaskRuntimeModule } from "node-task-runtime";

@Module({
  imports: [
    TaskRuntimeModule.forRoot({
      workers: "auto",          // Math.max(1, cores - 1) leaves 1 core for NestJS event loop
      eager: true,              // Pre-spawns workers on server boot
      maxTasksPerWorker: 5000,  // Prevents long-term V8 memory leaks
      maxQueueSize: 2000,       // Protects API against burst traffic
      overflowStrategy: "reject",
    }),
  ],
})
export class AppModule {}
```

### Standard Service Implementation
```typescript
import { Injectable, Inject, OnApplicationShutdown } from "@nestjs/common";
import { TASK_RUNTIME, TaskRuntime } from "node-task-runtime";

@Injectable()
export class AudioProcessingService implements OnApplicationShutdown {
  constructor(@Inject(TASK_RUNTIME) private readonly runtime: TaskRuntime) {}

  // Heavy CPU algorithm
  async extractSpectrogram(rawPcmBuffer: Buffer): Promise<Float32Array> {
    const task = this.runtime.task((buf: ArrayBuffer) => {
      // Computes in worker thread without lagging HTTP requests
      return computeFft(new Float32Array(buf));
    }, { name: "fft-task", timeout: 15000 });

    return await task(rawPcmBuffer.buffer, { transferList: [rawPcmBuffer] });
  }

  // External CLI tool with concurrency cap
  async convertToMp3(inputWavPath: string): Promise<string> {
    const ffmpeg = this.runtime.cli<{ file: string }, string>("ffmpeg", {
      name: "ffmpeg-mp3",
      concurrency: 2, // Hard limit to avoid saturating server cores
      args: (input, ctx) => {
        const out = ctx.createTempFile(".mp3");
        return ["-y", "-i", input.file, "-vn", "-b:a", "192k", out];
      },
      stdout: "string",
    });

    return await ffmpeg({ file: inputWavPath });
  }

  async onApplicationShutdown() {
    // Gracefully drain all running and pending tasks
    await this.runtime.shutdown(15000);
  }
}
```

---

## 5. Development & Testing Workflow

- **Package Manager**: Strictly use `pnpm` (never `npm` or `yarn`).
- **Build**: `pnpm run build` (`tsup` generating ESM, CJS, and `.d.ts`).
- **Type Checking**: `pnpm run typecheck` (`tsc --noEmit`).
- **Run Tests**: `pnpm test` (`vitest run`).
- **Coverage**: `pnpm run test:coverage`.
- **Architecture Decisions**: When adding or revising architectural behaviors, record decisions in [docs/AI/DECISIONS.md](file:///ssd0/git/NodeJS-Task-Runtime/docs/AI/DECISIONS.md).
