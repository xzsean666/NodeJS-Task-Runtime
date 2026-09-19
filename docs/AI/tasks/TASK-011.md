# TASK-011: 生产级深度加固（状态同步、泄露防范、批处理短路与导出完整性）

## 目标
深入梳理代码库，精准排查真实存在的状态不一致、内存/事件泄露、并发资源浪费及类型导出缺漏，杜绝无意义重构，实施精准、务实、工业级加固。

## 详细优化项
1. **WorkerPool 状态同步与内存泄露修复**：
   - 修复 `WorkerPool` 中 worker 崩溃、异常退出、缩容或强制终止时未同步移除 `readyWorkers` 集合中对应 ID 的 Bug，消除潜在内存泄露与预热状态判定虚高。
2. **WorkerPool waitQueue 即时取消 (Fast Abort)**：
   - 为排队在 `waitQueue` 中的任务挂载 `signal.addEventListener("abort")` 监听器，取消时即刻从队列移出并拒绝，无需等待被 worker shift 出来。
3. **TaskScheduler.clear() 资源清理与通知**：
   - 在 `clear()` 清空队列时调用 `item.cleanupQueueSignal?.()` 移除信号监听器，防范长生命周期 AbortSignal 造成的监听器泄露，并调用 `this.notifyIdle()` 及时唤醒等待者。
4. **ExecutionContext.nextAttempt() 进度回调延续**：
   - 在 `nextAttempt()` 中带上 `onProgress: this.onProgressCallback`，确保任务重试时子重试上下文依然能正常上报进度事件。
5. **LifecycleManager 状态机防护**：
   - 在 `LifecycleManager.start()` 中禁止在 `draining`（排空中）状态下重新调用 `start()`，防止破坏正在执行的优雅关机流程。
6. **TaskCallable.batch 失败短路 (Early-Exit on Error)**：
   - 在 `runWithConcurrencyLimit` 中引入 `hasError` 标志，一旦有子任务失败立即停止领取后续未开始的任务，节约 CPU/IO 资源。
7. **根导出与 TypeScript 类型补全**：
   - 在 `src/index.ts` 中导出全部 12 个强类型事件负载接口（`TaskQueuedEvent`, `TaskStartEvent`, `TaskCompleteEvent`, `TaskErrorEvent` 等）以及 `CliProcessOptions`，极大提升外部开发体验。

## 验证
- 28 个测试文件，132 个测试用例全部通过（100%）。
- 编译通过（`pnpm build` -> ESM / CJS / DTS）。
