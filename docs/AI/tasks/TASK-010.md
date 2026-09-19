# TASK-010: Comprehensive Optimization: Transferable Objects, Stdio Buffer Protection, Type Inference & CI Workflow

## Objective
全面优化 Node.js Task Runtime：支持 Worker 线程零拷贝 Transferable Objects、CLI/Process 缓冲区溢出保护与实时流式 Hook、Worker 闭包报错友好诊断、Pipeline 深度泛型推导，以及 GitHub Actions 多版本自动化测试工作流。

## Scope
- Worker 线程：支持 `transferList` 零拷贝对象转移（ArrayBuffer / MessagePort），Worker 内部返回结果自动转移 ArrayBuffer
- 开发者体验：针对 Worker 线程执行内联函数时的 `ReferenceError`，提供清晰诊断指引（解释闭包/作用域限制并引导使用 `modulePath`）
- 进程保护：CLI / Process 增加 `maxBuffer` 溢出限制与 `BUFFER_OVERFLOW` 错误模型，防止海量输出导致 Node.js OOM
- 实时流式：CLI / Process 增加 `onStdout` 与 `onStderr` chunk 级别回调 Hook
- 类型系统：`runtime.pipeline(...)` 扩展支持至 8 阶段的强类型推导，兼容 `TaskCallable` 与原生异步函数
- CI/CD：创建 `.github/workflows/ci.yml`（Node 18/20/22 矩阵测试，仅创建不触发）
- 测试与文档：新增专项测试文件，更新 README.md 与决策文档

## Allowed Files
- `src/core/types.ts`
- `src/execution/error.ts`
- `src/executors/thread/types.ts`
- `src/executors/thread/executor.ts`
- `src/executors/thread/pool.ts`
- `src/executors/thread/worker-runtime.ts`
- `src/executors/cli/process.ts`
- `src/executors/process/executor.ts`
- `src/core/runtime.ts`
- `.github/workflows/ci.yml`
- `tests/features/v2-optimizations.test.ts`
- `README.md`
- `docs/AI/`

## Dependencies
- TASK-009

## Inputs and Outputs
- **Inputs**: 现有 v0.2.0 代码库
- **Outputs**: 零拷贝性能、OOM 保护、闭包诊断、更佳类型安全及 CI 配置文件

## Acceptance Criteria
1. Transferable Objects 传递成功且发送方 ArrayBuffer 成功 detached（零拷贝）。
2. Worker 闭包 ReferenceError 包含明确的排查与建议提示。
3. 超出 maxBuffer 限制的 CLI / Process 任务被正确中断并抛出 BUFFER_OVERFLOW。
4. onStdout / onStderr 能够实时获取到数据分块。
5. 6 阶段以上的 pipeline 顺利编译并正确执行。
6. GitHub Actions workflow 文件创建合规且未触发远端构建。
7. 所有 26 个测试文件、119 个测试全部 100% 通过，生产打包构建无误。

## Verification Commands
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `pnpm build`

## Status
DONE
