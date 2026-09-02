# TASK-004: Priority Queue, Scheduler & Concurrency Controller

## Objective
实现基于优先级的任务调度队列与并发控制器，满足全局及 Task 级并发约束。

## Scope
- 实现高性能优先级队列 `PriorityQueue`（支持数字优先级，高优先级的任务先出队，同优先级先进先出 FIFO）
- 实现并发控制器 `ConcurrencyLimiter`（支持全局并发与 Task 独立并发令牌分配）
- 实现核心调度器 `TaskScheduler`（负责排队、出队、分发执行、队列统计）
- 单元测试覆盖各种优先级入队出队、并发上限及饥饿预防机制

## Allowed Files
- `src/scheduler/queue.ts`
- `src/scheduler/priority-queue.ts`
- `src/scheduler/concurrency.ts`
- `src/scheduler/scheduler.ts`
- `tests/scheduler/priority-queue.test.ts`
- `tests/scheduler/scheduler.test.ts`

## Dependencies
- TASK-003

## Inputs and Outputs
- **Inputs**: Execution 上下文与生命周期模型
- **Outputs**: 优先级队列、并发控制和调度器及测试

## Acceptance Criteria
1. `PriorityQueue` 严格按优先级高->低，同优先级 FIFO 出队。
2. `ConcurrencyLimiter` 正确限制全局与单个 Task 的并发执行数。
3. `TaskScheduler` 协调队列与并发，支持入队、调度和统计。
4. 单元测试全部通过。

## Verification Commands
- `pnpm test`

## Risks and Assumptions
- 异步锁与调度通知需避免竞态条件与死锁。

## Status
DONE
