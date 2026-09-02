# TASK-007: Execution Controls (Timeout, Retry with Backoff, AbortSignal Cancellation & Resource Limits)

## Objective
实现执行控制能力：超时自动终止、失败自动重试策略（支持 Backoff 退避）、AbortSignal 优雅取消、以及内存等资源限制参数透传。

## Scope
- 实现 `TimeoutController`（超时自动调用底层 terminate/kill，抛出包含 timeout 标识的 RuntimeError）
- 实现 `RetryController`（支持指定 attempts 次数与指数/线性退避 backoff 间隔）
- 实现 `CancellationController`（接入标准 AbortSignal，触发时统一终止 Worker/Process/CLI）
- 实现资源限制与内存配置解析 (`src/resource/memory.ts`)
- 编写单元测试验证超时、取消与重试逻辑

## Allowed Files
- `src/execution/timeout.ts`
- `src/execution/retry.ts`
- `src/execution/cancellation.ts`
- `src/resource/memory.ts`
- `tests/execution/timeout.test.ts`
- `tests/execution/retry.test.ts`
- `tests/execution/cancellation.test.ts`
- `tests/resource/memory.test.ts`

## Dependencies
- TASK-002
- TASK-003

## Inputs and Outputs
- **Inputs**: 错误模型与执行上下文
- **Outputs**: 完善的超时、重试、取消与资源配置控制模块及测试

## Acceptance Criteria
1. 超时能够精准触发底层终止，并抛出带有 timeout 标记的错误。
2. 重试机制按配置重试指定次数，并遵守退避延迟。
3. AbortController 取消后立即终止任务并释放资源。
4. 单元测试全部通过。

## Verification Commands
- `pnpm test`

## Risks and Assumptions
- 避免定时器内存泄露与取消后的悬挂 Promise。

## Status
DONE
