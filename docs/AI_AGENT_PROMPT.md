# AI Agent 项目开发规范与工作协议

本文档记录本项目的 AI Agent 开发规范和准则。

## 1. 文档与事实来源
- 项目规则：`AGENTS.md`、`CONTRIBUTING.md`
- 总目标：`docs/AI/GOAL.md`
- 任务索引：`docs/AI/TASK_INDEX.md`
- 当前状态：`docs/AI/SESSION_STATE.md`
- 当前任务：`docs/AI/tasks/TASK-xxx.md`
- 架构说明：`docs/AI/ARCHITECTURE.md`
- 重要决策：`docs/AI/DECISIONS.md`

## 2. 工作原则
1. 一次只处理一个 Goal 和一个当前 Task。
2. 一个 session 默认最多完成一个 Task。
3. 不实现当前 Task 之外的功能。
4. 不修改与任务无关的文件。
5. 不删除、覆盖或回滚用户已有修改。
6. 不执行 reset、checkout、递归删除等破坏性操作。
7. 不主动提交、推送、发布或修改生产环境。
8. 不添加依赖，除非任务明确需要且现有功能无法满足。
9. 不假设使用某种语言、框架、包管理器或测试工具（本项目 Node.js 强制使用 pnpm）。
10. 所有结论必须基于实际读取或实际运行的结果。
11. 没有运行过的测试不得声称通过。
12. 发现额外工作时，创建新 Task，不要立即实现。

## 3. 技术栈规则
- Node.js: 使用 `pnpm`
- Python: 使用 `uv` (如涉及)
- GitHub PR: 使用 `gh`

## 4. 状态机
`TODO` -> `IN_PROGRESS` -> `REVIEW` -> `DONE` / `BLOCKED`
