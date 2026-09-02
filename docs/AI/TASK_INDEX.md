# Task Index

| Task ID | Description | Status | Dependencies | Target / Focus |
| :--- | :--- | :--- | :--- | :--- |
| [TASK-001](tasks/TASK-001.md) | Project Skeleton, Toolchain & Testing Infrastructure Setup | DONE | None | package.json, tsconfig, vitest, pnpm |
| [TASK-002](tasks/TASK-002.md) | Core Types, Status, Error Models & Event Center | DONE | TASK-001 | types, RuntimeError, events |
| [TASK-003](tasks/TASK-003.md) | Core Execution Context, Executor Contract & Lifecycle Manager | DONE | TASK-002 | execution context, executor interface, lifecycle |
| [TASK-004](tasks/TASK-004.md) | Priority Queue, Scheduler & Concurrency Controller | DONE | TASK-003 | priority queue, concurrency limiter, scheduler |
| [TASK-005](tasks/TASK-005.md) | Worker Threads Executor, Worker Pool & Crash Recovery | DONE | TASK-003 | worker threads, pool, cpu detection, recovery |
| [TASK-006](tasks/TASK-006.md) | Child Process & CLI Executor with Stdio Streaming & Crash Recovery | DONE | TASK-003 | child process, cli, stdio streams, recovery |
| [TASK-007](tasks/TASK-007.md) | Execution Controls (Timeout, Retry, Cancellation & Resource Limits) | DONE | TASK-002, TASK-003 | timeout, retry with backoff, abort signal, memory |
| [TASK-008](tasks/TASK-008.md) | Runtime Core Assembly, Task API & Observability Metrics | DONE | TASK-004, TASK-005, TASK-006, TASK-007 | createRuntime, task/cli API, batch, stats |
| [TASK-009](tasks/TASK-009.md) | End-to-End Integration Tests, Examples & Documentation | DONE | TASK-008 | e2e tests, examples, README.md |
