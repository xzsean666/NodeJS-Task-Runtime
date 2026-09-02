# TASK-002: Core Types, Status, Error Models & Event Center

## Objective
定义 Task Runtime 的核心类型系统、任务状态机模型、统一 RuntimeError 异常体系以及可观测事件中心。

## Scope
- 定义 TaskOptions, RuntimeOptions, ResourceLimits, ExecutionStatus 枚举
- 实现统一的 `RuntimeError`（包含 taskId, executionId, executor, exitCode, signal, timeout, retryCount, cause 等上下文）
- 实现事件系统 `RuntimeEventEmitter` 及事件定义 (`task:start`, `task:complete`, `task:error`, `task:timeout`, `task:cancel`)
- 单元测试覆盖 Error 与 Event 模块

## Allowed Files
- `src/core/types.ts`
- `src/execution/error.ts`
- `src/observability/events.ts`
- `src/observability/logger.ts`
- `src/resource/limits.ts`
- `tests/core/error.test.ts`
- `tests/core/events.test.ts`

## Dependencies
- TASK-001

## Inputs and Outputs
- **Inputs**: 骨架仓库
- **Outputs**: 核心类型、状态机、错误体系与事件中心代码及单元测试

## Acceptance Criteria
1. 所有核心类型和配置接口定义完备。
2. `RuntimeError` 包含所有 PRD 要求的上下文字段，支持 error formatting。
3. `RuntimeEventEmitter` 类型安全，支持精准的事件 payload 监听与触发。
4. 单元测试 100% 通过。

## Verification Commands
- `pnpm test`

## Risks and Assumptions
- 保持类型扩展性，兼顾函数 Task 与 CLI Task 的差异与统一。

## Status
DONE
