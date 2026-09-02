# TASK-008: Runtime Core Assembly, Task API & Observability Metrics

## Objective
组装 Task Runtime，提供面向用户的统一 Task API（`createRuntime`、`runtime.task`、`runtime.cli`、`task.batch`、`task.map`、`runtime.all`、`runtime.stats`、`runtime.shutdown`）及可观测性。

## Scope
- 实现 `TaskRuntime` 核心聚合类 (`src/core/runtime.ts`)
- 实现对外 API 包装器 (`src/api/runtime.ts`、`src/api/task.ts`、`src/api/cli.ts`)
- 实现 `MetricsCollector` 汇总 statistics（Total, Running, Queued, Completed, Failed, Cancelled, Timeout, Workers, Avg Duration 等）
- 实现 Task 的 `batch` 和 `map` 辅助方法
- 实现 `runtime.all` 并发辅助方法
- 编写 API 单元测试与集成测试

## Allowed Files
- `src/api/runtime.ts`
- `src/api/task.ts`
- `src/api/cli.ts`
- `src/core/runtime.ts`
- `src/core/task.ts`
- `src/observability/metrics.ts`
- `src/index.ts`
- `tests/api/runtime.test.ts`
- `tests/api/batch.test.ts`
- `tests/observability/metrics.test.ts`

## Dependencies
- TASK-004
- TASK-005
- TASK-006
- TASK-007

## Inputs and Outputs
- **Inputs**: 调度器、执行器与控制模块
- **Outputs**: 完整的 Task Runtime SDK 公开 API 及指标统计

## Acceptance Criteria
1. 符合 PRD 描述的极简 API：`const runtime = createRuntime()`, `const calculate = runtime.task(fn)`, `await calculate(input)`.
2. 支持 `task.batch`、`task.map` 和 `runtime.all`。
3. `runtime.stats()` 返回完整统计指标。
4. `await runtime.shutdown()` 正确优雅清理。
5. 单元测试全部通过。

## Verification Commands
- `pnpm test`

## Risks and Assumptions
- API 类型推导需完善，支持泛型 `Task<Input, Output>`。

## Status
DONE
