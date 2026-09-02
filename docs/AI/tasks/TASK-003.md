# TASK-003: Core Execution Context, Executor Contract & Lifecycle Manager

## Objective
建立核心 Execution 上下文管理、Executor 抽象协议规范以及 Runtime 的生命周期管理器。

## Scope
- 实现 `ExecutionContext`（维护 taskId, executionId, status, duration, abort controller 等）
- 定义 `Executor` 抽象接口契约 (`execute`, `terminate`, `stats`, `destroy`)
- 实现 `LifecycleManager`（状态迁移: `created` -> `running` -> `draining` -> `stopped`，实现优雅停机 Graceful Shutdown）
- 单元测试验证生命周期状态机与优雅停机流程

## Allowed Files
- `src/core/execution.ts`
- `src/core/executor.ts`
- `src/core/lifecycle.ts`
- `tests/core/lifecycle.test.ts`
- `tests/core/execution.test.ts`

## Dependencies
- TASK-002

## Inputs and Outputs
- **Inputs**: 核心类型与错误模型
- **Outputs**: Execution 上下文对象、Executor 基础接口、Lifecycle 管理器及测试

## Acceptance Criteria
1. Execution 上下文正确生成唯一 ID，并跟踪执行状态生命周期。
2. LifecycleManager 正确管理阶段转换，并在 shutdown 时拒绝新任务并等待运行中任务结束。
3. 单元测试覆盖生命周期流转。

## Verification Commands
- `pnpm test`

## Risks and Assumptions
- 确保 shutdown 的超时与安全清理机制健全。

## Status
DONE
