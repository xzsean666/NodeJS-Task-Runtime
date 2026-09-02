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
