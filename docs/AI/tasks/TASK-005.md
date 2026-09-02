# TASK-005: Worker Threads Executor, Worker Pool & Crash Recovery

## Objective
实现 Node.js Worker Threads 执行器、Worker 线程池、自适应 CPU Worker 数量检测以及 Worker 异常退出与崩溃自愈机制。

## Scope
- 实现 CPU 核心检测与自动 Worker 数计算 (`src/resource/cpu.ts`)
- 实现通用的 Worker 运行时包装脚本 (`worker-runtime.ts` / IPC 消息协议)
- 实现 `WorkerPool`（管理活跃 worker、空闲 worker、worker 生命周期、动态创建与销毁）
- 实现 `ThreadExecutor`（分发任务给 Worker Pool，接收返回值或捕获 Worker 异常）
- 实现 Worker 崩溃检测与自愈替换机制（Crash Detection & Automatic Replacement）
- 编写单元测试与 Worker 崩溃恢复测试

## Allowed Files
- `src/resource/cpu.ts`
- `src/executors/thread/executor.ts`
- `src/executors/thread/pool.ts`
- `src/executors/thread/worker-runtime.ts`
- `src/executors/thread/types.ts`
- `tests/executors/thread-executor.test.ts`
- `tests/executors/worker-pool.test.ts`

## Dependencies
- TASK-003

## Inputs and Outputs
- **Inputs**: Executor 接口与资源限制
- **Outputs**: 完整的 Worker Threads 执行器与线程池，支持 JS/TS 函数执行与崩溃自愈

## Acceptance Criteria
1. 支持将 JS 函数或函数字符串分发至 Worker 线程执行并返回结果。
2. 支持 CPU 自动感知或手动指定 workers 数量。
3. Worker 发生致命崩溃或意外退出时，Pool 自动剔除并补充新 Worker，未完成任务抛出统一错误并允许重试。
4. 单元测试覆盖正常执行、复杂对象传递与崩溃自愈。

## Verification Commands
- `pnpm test`

## Risks and Assumptions
- Worker Threads 中通信需支持结构化克隆（Structured Clone）与 Buffer/JSON。
- 在 TypeScript/ESM 环境下需保证 worker 脚本路径定位可靠。

## Status
DONE
