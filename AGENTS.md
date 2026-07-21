# AGENTS.md

## North Star

> 打造一个让全球开发者信赖、赞叹并愿意共同参与的，开源、本地优先、厂商中立、可靠可恢复的 AI Agent 编排基础设施。让任何开发者都能在一个统一控制平面中，安全、透明、高效地协调不同 Agent，使它们真正实现 1+1>2。

> Build the open, local-first, vendor-neutral orchestration fabric that developers trust to coordinate any AI agent—safely, transparently, and reliably.

完整愿景、成功标准与决策优先级见 `docs/vision-and-principles.md`，所有设计和代码决策都必须遵守。

## 项目目标

本项目构建一个以 Pi 为统一入口的全局本地 Agent 编排层，适配 Pi、Claude Code、Codex CLI、Grok 和 Kimi Code，并提供额度感知调度、任务持久化和隔离工作区。

## 不可妥协的原则

1. 不制造另一个 Agent，而是让不同 Agent 更好地协作。
2. 不绑定任何厂商、模型、CLI 或云平台。
3. 本地优先，用户拥有代码、数据、任务和运行历史。
4. 可靠性优先于炫技，失败必须可恢复。
5. 不知道就是不知道，不伪造额度、成本和确定性。
6. 每一次调度都必须可解释。
7. 安全、隔离和权限边界必须从第一天设计。
8. 核心保持精简，能力通过 Adapter 和插件扩展。
9. 用 Agent 的差异创造协同价值，避免重复消耗。
10. 面向真实日常使用构建，而不是只做 Demo。

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
- 每个开发批次完成后必须执行“审查 → 整理 → 复测 → 复盘”闭环：检查 diff、错误路径、安全边界、文档和测试，整理临时代码，再运行类型检查与完整测试；未完成该闭环不得宣称完成。
- 每次复盘都要记录新发现、遗留风险和下一步，不掩盖失败，不把一次成功 Smoke Test 当成完整验证。

## 当前阶段

V1 Runtime Execution：已实现内部 Adapter 协议、Process Supervisor、统一 Executor、Dry Run、显式 Execute 和四个 Runtime 的端到端只读复测。Kimi 因无法在 Prompt 模式强制只读而保持禁用。任何额外的额度消耗测试仍须说明必要性，避免重复消耗。
