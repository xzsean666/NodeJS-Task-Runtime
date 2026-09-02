# Node.js Task Runtime (SDK)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/Tests-Passing-brightgreen.svg)]()

A simple, unified, high-performance **Task Execution Runtime** for Node.js.

---

## 🎯 Core Philosophy

> **Hide the Execution, Expose the Task.**
>
> Developers shouldn't have to deal with the low-level complexities of `Worker Threads`, `Child Processes`, `IPC message protocols`, or exit codes.
> You define tasks: `const result = await task(input)` — the runtime handles the rest.

---

## ✨ Key Features

- 🧵 **Worker Threads Pool**: Zero-configuration worker thread execution with automated CPU-core sensing (`workers: "auto"`).
- 💻 **Unified CLI & Child Process Execution**: Seamlessly invoke external binaries, CLI tools (FFmpeg, Rust/Go utilities, shell scripts) with automatic argument mapping and JSON/string/buffer stdio formatting.
- ⚡ **Priority Queue & Concurrency Control**: Priority-based scheduling with stable FIFO order for identical priorities, plus global and task-level concurrency rate limits.
- 🛡️ **Crash Recovery & Auto-Healing**: Immediate detection of worker crashes or process errors with automatic worker replacement and isolated task error propagation.
- ⏱️ **Execution Controls**: Built-in timeout enforcement, configurable retry strategies (fixed, linear, exponential backoff), and standard `AbortSignal` cancellation.
- 📊 **Full Observability & Metrics**: Real-time runtime statistics (`runtime.stats()`), execution durations, event emitter (`task:queued`, `task:start`, `task:complete`, `task:error`, `task:retry`, `worker:crash`, `lifecycle:change`), and logger adapters.
- 🛑 **Graceful Shutdown**: Drain active tasks safely within a timeout window to prevent dropped workloads or zombie processes.

---

## 📦 Installation

```bash
pnpm add node-task-runtime
```

*(Also compatible with `npm` and `yarn`)*

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

// Execute batch in parallel across the worker pool
const batchResults = await fibonacci.batch([10, 20, 30, 35]);
console.log("Batch results:", batchResults);

// Graceful shutdown
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

### 3. Priority Scheduling & Concurrency Limits

```typescript
import { createRuntime } from "node-task-runtime";

const runtime = createRuntime({
  workers: 4,
  maxConcurrency: 2, // Maximum 2 tasks run concurrently across the runtime
});

const task = runtime.task(async (data: { id: string }) => {
  await fetch(`https://api.example.com/sync/${data.id}`);
  return { id: data.id, synced: true };
}, {
  name: "data-sync",
  concurrency: 1, // At most 1 sync task running at any given time
  retry: {
    attempts: 3,
    backoff: "exponential",
    delay: 200,
  },
});

// High-priority task executed before lower-priority tasks in the queue
const urgent = task({ id: "urgent-101" }, { priority: 100 });
const standard = task({ id: "std-001" }, { priority: 0 });

await Promise.all([urgent, standard]);
```

---

### 4. Cancellation & Timeouts

```typescript
import { createRuntime } from "node-task-runtime";

const runtime = createRuntime();

const controller = new AbortController();

const longTask = runtime.task(
  async () => {
    // long running computation
  },
  { timeout: 5000 } // Auto aborts if execution exceeds 5 seconds
);

// Pass external signal to cancel manually
const promise = longTask(null, { signal: controller.signal });

// Cancel execution
controller.abort("User cancelled operation");
```

---

### 5. Observability & Runtime Stats

```typescript
import { createRuntime } from "node-task-runtime";

const runtime = createRuntime();

// Listen to lifecycle & execution events
runtime.on("task:start", ({ taskId, taskName, executor }) => {
  console.log(`[Start] Task ${taskName} (${taskId}) on ${executor}`);
});

runtime.on("task:complete", ({ taskId, durationMs }) => {
  console.log(`[Complete] Task ${taskId} in ${durationMs}ms`);
});

runtime.on("task:retry", ({ taskName, attempt, delayMs }) => {
  console.warn(`[Retry] ${taskName} attempt #${attempt} waiting ${delayMs}ms`);
});

// Query live metrics snapshot
console.log(runtime.stats());
/*
{
  totalTasks: 42,
  completedTasks: 40,
  failedTasks: 2,
  cancelledTasks: 0,
  timedOutTasks: 0,
  retriedTasks: 3,
  activeExecutions: 2,
  queuedTasks: 5,
  activeWorkers: 4,
  idleWorkers: 0,
  totalWorkers: 4,
  averageDurationMs: 84.5
}
*/
```

---

## 🏛️ Architecture

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
                              Manager
              │
              ▼
         Task Registry
              │
              ▼
         Task Scheduler
              │
              ▼
         Priority Queue
              │
              ▼
       Execution Manager
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

Creates a runtime instance with global settings:

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `workers` | `number \| 'auto'` | `'auto'` | Worker thread count (auto calculates `availableParallelism - 1`) |
| `maxConcurrency` | `number` | `Infinity` | Max tasks running concurrently across the runtime |
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
| `retry` | `number \| RetryOptions` | `undefined` | Retry configuration (attempts, backoff, delay) |
| `executor` | `'thread' \| 'process' \| 'cli'` | `'thread'` | Executor backend |
| `resource` | `ResourceLimits` | `undefined` | Resource limits (e.g. `maxMemoryMb`) |
| `cwd` | `string` | `process.cwd()` | Working directory for CLI / Process |
| `env` | `Record<string, string>` | `process.env` | Environment variables for CLI / Process |
| `signal` | `AbortSignal` | `undefined` | External cancellation signal |

---

## 🧪 Testing & Verification

Run the full test suite (Unit tests + End-to-End integration tests):

```bash
pnpm test
```

Type check:

```bash
pnpm typecheck
```

Build production bundle (ESM + CJS + DTS):

```bash
pnpm build
```

---

## 📄 License

MIT License © 2026 NodeJS-Task-Runtime Authors.
