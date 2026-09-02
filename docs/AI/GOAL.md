# Project Goal: Node.js Task Runtime SDK

## 定位
Node.js Task Runtime 是一个统一的 **Task Execution Runtime**（Node.js 本地任务执行运行时）。
它的目标是让 Node.js 开发者只需要学习一套简单的 Task API，就能够方便地使用：
- Node.js Worker Threads
- Child Processes
- Rust / Go / C++ 程序
- 任意 CLI
- FFmpeg / ImageMagick 等外部工具

核心理念：
> **Hide the Execution, Expose the Task.**
> 用户只关心：`const result = await task(input)`，而不关心任务到底运行在哪里。

## 核心设计原则
1. **Task First**: 围绕 Task 设计 API，而非围绕 Worker。
2. **Executor Is Replaceable**: Task 不依赖具体 Executor，可在 Thread / Process / CLI 间替换。
3. **Runtime Owns Resources**: Worker、Process、Queue、Concurrency 由 Runtime 自动调度和管理。
4. **Same Task API, Different Execution Environment**: JS Task 与 CLI Task 调用形态一致。
5. **Automatic First, Manual Override Second**: 默认零配置自适应 CPU / 资源，支持自定义参数。
6. **Local First, Distributed Later**: MVP 聚焦单 Node.js 进程的高性能本地任务运行时。

## MVP 核心功能范围
- **Core**: Runtime、Task、Executor、Execution、Lifecycle (Graceful Shutdown)
- **Thread Executor**: Worker Threads、Worker Pool、自适应 CPU Worker 数量、Worker Crash Recovery
- **Process & CLI Executor**: Child Process、CLI 进程池/生命周期、stdio 协议、退出码与环境管理、Crash Recovery
- **Scheduler**: 统一任务队列、优先级调度（Priority Queue）、并发控制（全局/任务级）、Batch / Map 执行
- **Execution Controls**: Timeout、Retry (with backoff)、Cancellation (AbortSignal)、统一 RuntimeError 体系
- **Resource Limits**: CPU 自动检测、Worker 数管理、内存限制参数透传
- **Observability**: Task ID、Execution ID、状态机事件（events）、基础统计（metrics/stats）、Logger 适配器
- **Data Protocols**: JSON、String、Buffer / Binary
