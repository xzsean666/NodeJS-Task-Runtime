# TASK-006: Child Process & CLI Executor with Stdio Streaming & Crash Recovery

## Objective
实现 Child Process 与外部 CLI 程序执行器，支持标准输入输出流、退出码、自定义环境与工作目录、以及进程异常恢复。

## Scope
- 实现 `ProcessExecutor` 与 `CLIExecutor`
- 支持传入 `args`、`cwd`、`env`、`stdin`
- 支持输出捕获（JSON 解析、String、Buffer）以及 stdout/stderr 流式事件监听
- 实现 Process 生命周期管理与非 0 退出码统一转换为 `RuntimeError`
- 实现 Process 进程异常崩溃与 kill 处理
- 编写单元测试验证 CLI 调用、参数传递、流式输出与错误处理

## Allowed Files
- `src/executors/process/executor.ts`
- `src/executors/process/pool.ts`
- `src/executors/process/manager.ts`
- `src/executors/cli/executor.ts`
- `src/executors/cli/process.ts`
- `src/executors/cli/protocol.ts`
- `src/transport/protocol.ts`
- `src/transport/json.ts`
- `src/transport/binary.ts`
- `tests/executors/cli-executor.test.ts`
- `tests/executors/process-executor.test.ts`

## Dependencies
- TASK-003

## Inputs and Outputs
- **Inputs**: Executor 接口与数据传输协议
- **Outputs**: 完善的 Child Process 和 CLI 执行器及测试

## Acceptance Criteria
1. 支持 spawn 任意外部 CLI 或命令，捕获 stdout/stderr。
2. 自动根据返回内容解析 JSON、Buffer 或普通文本。
3. 支持动态与静态 args、cwd、env。
4. 退出码非 0 或被 signal 终止时抛出统一 `RuntimeError`。
5. 测试用例全部通过。

## Verification Commands
- `pnpm test`

## Risks and Assumptions
- 跨平台兼容性（Linux/macOS/Windows 路径与命令解析）。

## Status
DONE
