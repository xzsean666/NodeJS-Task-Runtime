# TASK-009: End-to-End Integration Tests, Examples & Documentation

## Objective
提供端到端集成测试（覆盖 Worker、CLI、超时、重试、取消、并发排队、优雅停机）、示例代码与完善的 README 使用文档。

## Scope
- 编写 E2E 测试套件，验证全流程在真实 Node.js 进程与 CLI 程序下的表现
- 编写示例（JS 计算任务、CLI 工具调用任务、高并发队列任务）
- 编写完善的 `README.md`，包含安装、快速上手、配置说明与完整 API 示例

## Allowed Files
- `tests/e2e/runtime-e2e.test.ts`
- `examples/basic.ts`
- `examples/cli.ts`
- `examples/batch.ts`
- `README.md`

## Dependencies
- TASK-008

## Inputs and Outputs
- **Inputs**: 完整的 Runtime SDK 实现
- **Outputs**: E2E 测试、示例程序与高质量 README 文档

## Acceptance Criteria
1. 所有 E2E 测试运行通过。
2. 示例程序均可直接运行。
3. README 包含清晰的架构图、API 指南与最佳实践。

## Verification Commands
- `pnpm test`
- `pnpm build`

## Risks and Assumptions
- 确保测试中涉及的子进程命令跨 Linux/macOS 兼容。

## Status
DONE
