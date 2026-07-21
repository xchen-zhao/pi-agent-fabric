# AGENTS.md

## 项目目标

本项目构建一个以 Pi 为统一入口的全局本地 Agent 编排层，适配 Pi、Claude Code、Codex CLI、Grok 和 Kimi Code，并提供额度感知调度、任务持久化和隔离工作区。

## 开发约定

- 使用 TypeScript、ESM 和 Node.js 24+。
- Runtime 差异必须封装在 `src/adapters/`，核心调度器不得拼接具体 CLI 参数。
- 禁止读取、打印或持久化任何认证 Token、Cookie、API Key 或完整认证文件。
- Discovery/Doctor 默认只能执行无副作用命令，例如 `--version` 和 `--help`。
- 无法精确获取额度时必须标记为 `unknown` 或 `inferred`，不得伪造精确数值。
- 自动执行外部 Agent 前必须有超时、取消、输出截断和工作目录边界。
- 多个写 Agent 不得共享同一普通工作目录；代码任务后续统一使用 Git worktree 或沙箱。
- 注释和文档优先使用中文；公开类型和代码标识符使用英文。
- 新增功能必须补测试。

## 当前阶段

V0 Runtime Discovery：只检测命令、版本、无副作用能力和认证配置迹象，不发送模型请求，不消耗额度。
