# Node.js Task Runtime (SDK)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/Tests-126%20Passing-brightgreen.svg)]()
[![Version](https://img.shields.io/badge/Version-0.2.0-orange.svg)]()

A simple, unified, enterprise-grade **Task Execution Runtime** for Node.js.

---

## 🎯 Core Philosophy

> **Hide the Execution, Expose the Task.**
>
> Developers shouldn't have to deal with the low-level complexities of `Worker Threads`, `Child Processes`, `IPC message protocols`, or exit codes.
> You define tasks: `const result = await task(input)` — the runtime handles the rest.

---

## ✨ Key Features

- 🧵 **Worker Threads Pool**: Zero-configuration worker thread execution with automated CPU-core sensing (`workers: "auto"`), lazy worker initialization, dynamic runtime pool resizing (`runtime.resizeWorkers(n)`), and server prewarming (`runtime.warmup()`, `eager: true`).
- ⚡ **Zero-Copy Transferable Objects**: Transfer `ArrayBuffer` and `MessagePort` ownership seamlessly (`transferList: [buf]`) without expensive structured clone memory copying.
- 💻 **Unified CLI & Child Process Execution**: Seamlessly invoke external binaries, CLI tools (FFmpeg, Rust/Go utilities, shell scripts) with dynamic argument/command mapping, stdin/stdout formatters (JSON/string/binary/pipe), and zombie process prevention.
- 📁 **Managed Temp Files & Directories**: Built-in scratch workspace (`context.createTempFile()`, `context.createTempDir()`) with automatic leak protection (`autoCleanTemp: "on_error" | "always"`).
- 🛡️ **Stdio Buffer Protection & Live Streaming**: Prevent OOM with configurable `maxBuffer` limits, and hook into stdout/stderr in real-time via `onStdout` and `onStderr`.
- ⚡ **Priority Queue & Concurrency Control**: Stable FIFO priority scheduling, per-task and global concurrency bounds, and an optimized $O(N)$ selective dequeuing algorithm.
- 🛡️ **Crash Recovery & Auto-Healing**: Immediate detection of worker crashes or process errors with automatic worker replacement and isolated task error propagation.
- ⏱️ **Execution Controls & Jitter**: Built-in timeout enforcement, configurable retry strategies (fixed, linear, exponential backoff) with **Full Jitter** support to prevent retry storms, and standard `AbortSignal` cancellation.
- 🧅 **Onion-Model Middlewares**: Register runtime-wide and task-level interceptors (`runtime.use(middleware)`) for APM logging, validation, distributed tracing, and metrics.
- 🔗 **Task Pipeline & Chaining**: Chain tasks and functions seamlessly using `runtime.pipeline(t1, t2, ...)` or `task.pipe(nextTask)` with deep TypeScript type-inference.
- 📦 **Advanced Batch Processing**: Execute batches with `task.batch()` (fail-fast) or `task.batchSettled()` (fault-tolerant `PromiseSettledResult`), with optional `batchConcurrency` windowing.
- 🚦 **Backpressure & Queue Overflow Protection**: Configure `maxQueueSize` with `overflowStrategy: "reject" | "drop_oldest"` to prevent memory exhaustion under high ingest rates.
- 📈 **Real-Time Progress Reporting & Task Inspector**: Long-running tasks report execution progress via `context.reportProgress(percent, msg)`. Live inspection of active running tasks via `runtime.getActiveTasks()`.
- 📊 **Full Observability & Metrics**: Real-time runtime statistics (`runtime.stats()`), execution durations, event emitter (`task:queued`, `task:start`, `task:progress`, `task:complete`, `task:error`, `task:retry`, `worker:spawn`, `worker:crash`, `lifecycle:change`), and logger adapters.
- 🛑 **Graceful Shutdown**: Safely drain both active and pending queued tasks before shutting down, with configurable timeout fallback.

---

## 📦 Installation

```bash
pnpm add node-task-runtime
# or npm install node-task-runtime
# or yarn add node-task-runtime
```

---

## 🚀 Quick Start

### 1. Compute in Worker Threads

```typescript
import { createRuntime } from "node-task-runtime";

// Initialize runtime (auto-detects CPU cores)
const runtime = createRuntime({ workers: "auto" });

// Define a CPU-intensive task
const fibonacci = runtime.task((n: number) => {
  const fib = (num: number): number => (num <= 1 ? num : fib(num - 1) + fib(num - 2));
  return fib(n);
}, { name: "fibonacci" });

// Execute single task
const result = await fibonacci(40);
console.log("Fibonacci(40) =", result);

// Execute batch across the worker pool
const batchResults = await fibonacci.batch([10, 20, 30, 35]);
console.log("Batch results:", batchResults);

// Graceful shutdown (waits for all queued/running tasks to complete)
await runtime.shutdown();
```

---

### 2. External CLI / Process Tasks

```typescript
import { createRuntime } from "node-task-runtime";

const runtime = createRuntime();

// Define a CLI task
const processImage = runtime.cli<{ inputPath: string; quality: number }, { success: boolean }>(
  "imagemagick",
  {
    name: "image-optimizer",
    args: (input) => ["convert", input.inputPath, "-quality", `${input.quality}%`, "output.jpg"],
    stdout: "json",
    timeout: 10000,
  }
);

// Call CLI as a regular async function
const response = await processImage({ inputPath: "photo.png", quality: 85 });
```

---

### 3. Onion-Model Middlewares (Interceptors)

```typescript
import { createRuntime } from "node-task-runtime";

const runtime = createRuntime();

// Add global middleware (e.g. performance logging / tracing)
runtime.use(async (ctx, next) => {
  const start = Date.now();
  console.log(`[START] Task ${ctx.taskName} (${ctx.taskId})`);
  try {
    const result = await next();
    console.log(`[DONE] Task ${ctx.taskName} took ${Date.now() - start}ms`);
    return result;
  } catch (err) {
    console.error(`[FAIL] Task ${ctx.taskName} failed:`, err);
    throw err;
  }
});

// Define task with task-specific middleware
const compute = runtime.task((x: number) => x * 10, {
  name: "compute",
  middlewares: [
    async (ctx, next) => {
      // Validate input before executing
      if (typeof ctx.input !== "number") throw new Error("Input must be a number");
      return next();
    },
  ],
});

await compute(42);
```

---

### 4. Pipeline & Task Chaining

```typescript
import { createRuntime } from "node-task-runtime";

const runtime = createRuntime();

const download = runtime.task(async (url: string) => `Raw data from ${url}`);
const parse = runtime.task((raw: string) => ({ count: raw.length }));
const format = (data: { count: number }) => `Parsed ${data.count} bytes`;

// Method A: runtime.pipeline
const fullPipeline = runtime.pipeline(download, parse, format);
const output = await fullPipeline("https://example.com/data");
console.log(output);

// Method B: task.pipe chaining
const processFlow = download.pipe(parse);
const result = await processFlow("https://example.com/data");
```

---

### 5. Advanced Batch Processing & Fault Tolerance

```typescript
import { createRuntime } from "node-task-runtime";

const runtime = createRuntime({ workers: 4 });

const fetchUser = runtime.task(async (userId: number) => {
  if (userId === 13) throw new Error("User 13 not found");
  return { id: userId, name: `User_${userId}` };
});

// Run batch with controlled concurrency window and fault tolerance
const results = await fetchUser.batchSettled([1, 2, 13, 14], {
  batchConcurrency: 2, // At most 2 tasks running simultaneously in this batch
});

results.forEach((res, idx) => {
  if (res.status === "fulfilled") {
    console.log("Success:", res.value);
  } else {
    console.warn("Failed:", res.reason.message);
  }
});
```

---

### 6. Priority Scheduling & Concurrency Limits

```typescript
import { createRuntime } from "node-task-runtime";

const runtime = createRuntime({
  workers: 4,
  maxConcurrency: 2, // Maximum 2 tasks run concurrently across the runtime
});

const task = runtime.task(async (data: { id: string }) => {
  return { id: data.id, synced: true };
}, {
  name: "data-sync",
  concurrency: 1, // At most 1 sync task running at any given time
  retry: {
    attempts: 3,
    backoff: "exponential",
    delay: 200,
    jitter: true, // Prevents retry storm with Full Jitter
  },
});

// High-priority task executed before lower-priority tasks in the queue
const urgent = task({ id: "urgent-101" }, { priority: 100 });
const standard = task({ id: "std-001" }, { priority: 0 });

await Promise.all([urgent, standard]);
```

---

### 7. Backpressure & Queue Overflow Protection

```typescript
import { createRuntime } from "node-task-runtime";

const runtime = createRuntime({
  maxConcurrency: 10,
  maxQueueSize: 1000,           // Maximum 1000 pending tasks allowed in queue
  overflowStrategy: "reject",   // Reject immediately with RuntimeError (QUEUE_FULL)
  // Or "drop_oldest" to discard oldest pending task
});
```

---

### 8. Progress Reporting

```typescript
import { createRuntime } from "node-task-runtime";

const runtime = createRuntime();

runtime.on("task:progress", ({ taskId, taskName, progress, message }) => {
  console.log(`[Progress ${progress}%] ${taskName}: ${message}`);
});

// Middleware can emit progress updates
runtime.use(async (ctx, next) => {
  ctx.reportProgress(10, "Initializing");
  const res = await next();
  ctx.reportProgress(100, "Completed");
  return res;
});
```

---

### 9. Zero-Copy Transferable Objects (Worker Threads)

```typescript
import { createRuntime } from "node-task-runtime";

const runtime = createRuntime();

const processBuffer = runtime.task((data: { buffer: ArrayBuffer }) => {
  const view = new Uint8Array(data.buffer);
  // Perform in-place heavy computation
  for (let i = 0; i < view.length; i++) view[i] ^= 0x42;
  return data.buffer; // Returning ArrayBuffer automatically transfers ownership back
});

const buffer = new ArrayBuffer(1024 * 1024 * 64); // 64MB buffer

// Zero-copy transfer: memory ownership is moved without memory cloning
const result = await processBuffer(
  { buffer },
  { transferList: [buffer] }
);
// In the caller thread, buffer.byteLength is now 0 (detached)
```

> [!NOTE]
> **Worker Threads & Closures**: Functions executed inline in worker threads cannot capture outer closures or variables.
> Always pass parameters via `input`, or use `runtime.task("./path/to/module.js")` (`modulePath`) to import tasks from files.

---

### 10. CLI Real-Time Streaming & Buffer Protection

```typescript
import { createRuntime } from "node-task-runtime";

const runtime = createRuntime();

const ffmpegTranscode = runtime.cli("ffmpeg", {
  name: "transcode",
  args: (input: { file: string }) => ["-i", input.file, "-f", "null", "-"],
  maxBuffer: 50 * 1024 * 1024, // 50MB max buffer limit to prevent OOM
  onStderr: (chunk) => {
    // Real-time parsing of FFmpeg progress logs
    process.stdout.write(`[Live Log] ${chunk.toString()}`);
  },
});
```

---

### 11. Managed Temp Files & Scratch Workspace

```typescript
import { createRuntime } from "node-task-runtime";
import fs from "node:fs/promises";

const runtime = createRuntime();

const transcodeTask = runtime.cli<{ videoUrl: string }, { outputVideo: string }>(
  "ffmpeg",
  {
    name: "video-transcoder",
    args: (input, ctx) => {
      // Create managed temporary files on disk
      const tempOutput = ctx.createTempFile(".mp4");
      return ["-i", input.videoUrl, "-c:v", "libx264", tempOutput];
    },
    // "on_error" (default): automatically deletes temp files if task fails/aborts
    // "always": deletes temp files upon completion regardless of outcome
    // false: keeps temp files intact
    autoCleanTemp: "on_error",
  }
);
```

---

### 12. Server Prewarming & Active Tasks Inspector

```typescript
import { createRuntime } from "node-task-runtime";

// Eager initialization on server startup
const runtime = createRuntime({ workers: 4, eager: true });

// Or manually prewarm workers
await runtime.warmup();

// Real-time snapshot of active running tasks (ideal for /metrics or /healthz endpoints)
const active = runtime.getActiveTasks();
active.forEach((task) => {
  console.log(`[Running] ${task.taskName} (${task.taskId}) - duration: ${task.durationMs}ms, progress: ${task.progress}%`);
});
```

---

## 🏛️ Architecture Overview

```text
                         Node.js Application
                                  │
                                  ▼
                       ┌────────────────────┐
                       │    Task Runtime     │
                       └─────────┬──────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
           Task API          Resource           Lifecycle
       (Task/CLI/Pipe)        Manager         (Drain Guard)
              │
              ▼
        Middleware Chain (Onion Model)
              │
              ▼
        Task Scheduler (Backpressure & Concurrency Limiter)
              │
              ▼
        Priority Queue (Heap + O(N) Dequeue Matching)
              │
              ▼
       Execution Manager (Timeout / Retry / Cancel)
              │
      ┌───────┼────────┐
      ▼       ▼        ▼
   Thread   Process    CLI
  Executor  Executor  Executor
      │       │        │
      ▼       ▼        ▼
   Workers  Processes  Programs
```

---

## 📖 API Reference

### `createRuntime(options?: RuntimeOptions): TaskRuntime`

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `workers` | `number \| 'auto'` | `'auto'` | Worker thread count (auto calculates `availableParallelism - 1`) |
| `eager` | `boolean` | `false` | Pre-spawns worker threads eagerly during runtime initialization |
| `maxConcurrency` | `number` | `0` (pool bounded) | Max tasks running concurrently across the runtime |
| `maxQueueSize` | `number` | `0` (unlimited) | Max queue depth before triggering backpressure |
| `overflowStrategy` | `'reject' \| 'drop_oldest'` | `'reject'` | Overflow strategy when `maxQueueSize` is exceeded |
| `middlewares` | `TaskMiddleware[]` | `[]` | Global middleware interceptors |
| `defaultTimeout` | `number` | `0` (disabled) | Default timeout in milliseconds |
| `defaultRetry` | `number \| RetryOptions` | `undefined` | Global default retry configuration |
| `defaultExecutor`| `'thread' \| 'process' \| 'cli'` | `'thread'` | Global default executor backend |
| `shutdownTimeout`| `number` | `10000` | Graceful shutdown timeout in milliseconds |

### `TaskOptions`

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `name` | `string` | `undefined` | Human readable task name for logging and metrics |
| `priority` | `number` | `0` | Numeric priority (higher dequeues first) |
| `concurrency` | `number` | `Infinity` | Per-task concurrency limit |
| `timeout` | `number` | `0` | Task execution timeout in milliseconds |
| `retry` | `number \| RetryOptions` | `undefined` | Retry configuration (attempts, backoff, delay, jitter) |
| `middlewares` | `TaskMiddleware[]` | `[]` | Task-level middleware interceptors |
| `executor` | `'thread' \| 'process' \| 'cli'` | `'thread'` | Executor backend |
| `resource` | `ResourceLimits` | `undefined` | Resource limits (e.g. `maxMemoryMb`) |
| `cwd` | `string` | `process.cwd()` | Working directory for CLI / Process |
| `env` | `Record<string, string>` | `process.env` | Environment variables for CLI / Process |
| `signal` | `AbortSignal` | `undefined` | External cancellation signal |
| `transferList` | `ArrayBuffer[]` | `undefined` | Transferable objects for zero-copy memory transfer in Worker Threads |
| `maxBuffer` | `number` | `10485760` (10MB) | Max buffer limit in bytes for CLI/Process stdout/stderr before aborting |
| `autoCleanTemp` | `boolean \| 'on_error' \| 'always'` | `'on_error'` | Automatic cleanup policy for temp files created via `ctx.createTempFile()` |
| `onStdout` | `(chunk: Buffer) => void` | `undefined` | Real-time stdout stream tap callback |
| `onStderr` | `(chunk: Buffer) => void` | `undefined` | Real-time stderr stream tap callback |

### `RetryOptions`

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `attempts` | `number` | Required | Total execution attempts (including initial run) |
| `backoff` | `'fixed' \| 'linear' \| 'exponential'` | `'exponential'` | Backoff strategy |
| `delay` | `number` | `100` | Initial base delay in milliseconds |
| `maxDelay` | `number` | `30000` | Maximum cap on delay in milliseconds |
| `jitter` | `boolean` | `false` | Enable Full Jitter to prevent retry storms |
| `retryIf` | `(err: RuntimeError) => boolean` | `undefined` | Custom filter predicate |

---

## 🧪 Testing & Verification

```bash
# Run test suite (126 unit & integration tests)
pnpm test

# Type checking
pnpm typecheck

# Production build
pnpm build
```

---

## 📄 License

MIT License © 2026 NodeJS-Task-Runtime Authors.
