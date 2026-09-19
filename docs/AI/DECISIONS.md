# Architectural Decisions Record (ADR)

## DECISION-001: 模块系统与打包输出
- **决策**: 项目采用 TypeScript 编写，输出 ESM 与 CJS 双格式（或纯 ESM，基于 Node 18+ 原生特性），使用 `tsup` 或 `tsc` 打包。
- **背景**: Task Runtime 需要在现代 Node.js 环境中原生支持 Worker Threads 与 Child Process。
- **状态**: Accepted

## DECISION-002: 包管理器与测试框架
- **决策**: 包管理器严格使用 `pnpm`。测试框架使用 `vitest` 进行单元测试与集成测试。
- **背景**: 遵守用户规则 `nodejs 都使用 pnpm`。Vitest 执行速度快，原生支持 TypeScript 和 Worker 隔离测试。
- **状态**: Accepted

## DECISION-003: 统一错误模型与错误隔离
- **决策**: 所有底层错误（Worker 崩溃、子进程退出码非 0、超时、取消）均封装为统一的 `RuntimeError`，包含 `taskId`、`executionId`、`executor`、`exitCode`、`signal`、`timeout`、`retryCount` 等关键上下文信息。
- **背景**: 用户无需分别捕获 Node Worker error、ChildProcess exit code、AbortError。
- **状态**: Accepted

## DECISION-004: 自适应资源分配策略
- **决策**: `workers: "auto"` 默认设置为 `Math.max(1, os.availableParallelism() - 1)`，留出至少 1 个核心给 Node.js 主事件循环和操作系统 IO。
- **背景**: 避免 Worker 完全占满 CPU 导致主事件循环卡死或网络 IO 响应超时。
- **状态**: Accepted

## DECISION-005: 调度器 Promise 决议保证与取消悬挂修复
- **决策**: `TaskScheduler.executeTask` 无论任务是在取消前还是取消后返回，必须确保返回的 Promise 得到确切的 `reject(cancelErr)` 或 `resolve(result)`，绝不能静默 `return` 导致 Promise 悬挂。
- **背景**: 审计发现任务在运行期间若收到 abort 信号，底层执行器返回时直接 `return;`，调用方 Promise 永久挂死。
- **状态**: Accepted

## DECISION-006: 洋葱模型中间件系统与拦截器架构
- **决策**: 引入 `TaskMiddleware`，支持 `runtime.use(...)` 全局中间件及任务级 `middlewares: [...]`，采用 Koa 风格的洋葱模型 `(ctx, next) => Promise<any>`。
- **背景**: 为 APM、分布式追踪、动态校验、输入过滤和耗时打点提供非侵入式的拦截扩展能力。
- **状态**: Accepted

## DECISION-007: 任务流水线 (Pipeline) 与链式组合
- **决策**: 引入 `runtime.pipeline(t1, t2, ...)` 和 `task.pipe(nextTask)`，前置任务输出自动作为后置任务输入，全链路透传追踪与取消上下文。
- **背景**: 大量复杂工作流（如 CLI 转码 -> Worker 解析 -> 业务处理）需要统一声明式管道，消除样条代码。
- **状态**: Accepted

## DECISION-008: 工业级退避抖动 (Full Jitter) 与防惊群
- **决策**: 在重试策略中支持 `jitter: true`，采用 Full Jitter 算法 `random(0, min(maxDelay, delay * 2^attempt))`。
- **背景**: 在高并发失败重试场景下，避免固定退避时间导致所有任务在同一毫秒发起重试（惊群效应）。
- **状态**: Accepted

## DECISION-009: 调度器反压控制 (Backpressure) 与溢出策略
- **决策**: 支持 `maxQueueSize` 与 `overflowStrategy: "reject" | "drop_oldest"`，当待处理队列超过阈值时触发反压。
- **背景**: 防止生产环境下任务摄入速率远高于处理速率时导致内存无限制增长引发 OOM。
- **状态**: Accepted

## DECISION-010: 优雅停机全量排空 (Complete Queue Draining)
- **决策**: `LifecycleManager` 在 `draining` 阶段与 `TaskScheduler` 协同，等待已入队任务全部出队并执行完毕（`pendingCount === 0 && runningCount === 0`）后再关闭执行器，除非超过 `shutdownTimeout`。
- **背景**: 原有逻辑仅等待已出队任务完成，导致排队中任务直接被截断丢失。
- **状态**: Accepted

