# TASK-001: Project Skeleton, Toolchain & Testing Infrastructure Setup

## Objective
初始化项目骨架，配置 TypeScript、pnpm 依赖、Vitest 测试环境、打包配置以及基础目录结构。

## Scope
- 配置 `package.json`（支持 ESM/CJS、TypeScript 声明导出）
- 配置 `tsconfig.json`
- 配置 `vitest.config.ts`
- 安装基础依赖（使用 pnpm）
- 创建基础目录骨架 `src/` 与测试目录 `tests/`
- 编写一个冒烟测试验证测试套件可用

## Allowed Files
- `package.json`
- `pnpm-lock.yaml`
- `tsconfig.json`
- `vitest.config.ts`
- `tsup.config.ts` (如需)
- `src/index.ts`
- `tests/smoke.test.ts`
- `.gitignore`

## Dependencies
- None

## Inputs and Outputs
- **Inputs**: 空仓库
- **Outputs**: 可通过 `pnpm test` 和 `pnpm build` 的完整工程脚手架

## Acceptance Criteria
1. `pnpm install` 成功，无异常。
2. `pnpm test` 能够正常执行并通过冒烟测试。
3. `pnpm build` (或 `pnpm typecheck`) 能够正确编译 TypeScript 代码。
4. 严格使用 `pnpm` 作为包管理器。

## Verification Commands
- `pnpm test`
- `pnpm typecheck` (or `pnpm build`)

## Risks and Assumptions
- 确保 Node.js 版本兼容性 (Node 18+)
- 确保 package.json exports 正确配置

## Status
DONE
