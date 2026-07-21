# Pi Agent Fabric

> Build the open, local-first, vendor-neutral orchestration fabric that developers trust to coordinate any AI agent—safely, transparently, and reliably.

以 Pi 为统一入口的全局本地 Agent 编排项目。它不是另一个 Agent，而是让不同 Agent 安全、透明、可靠地协同工作并实现 1+1>2 的基础设施。

目标适配：

- Pi
- Claude Code
- Codex CLI
- Grok Build
- Kimi Code

长期能力包括额度感知路由、任务持久化、并发租约、Git worktree/沙箱隔离、跨模型审查和失败接力。

## 当前状态

当前处于 **V1 Runtime Execution**：已完成 Runtime Discovery、内部 Adapter 协议、Process Supervisor、统一 Executor、JSONL 事件归一化和安全执行门禁。Pi、Claude、Codex、Grok 已通过端到端只读复测；Kimi 在 ACP 或外部沙箱完成前会被拒绝执行。

## 开发

```bash
npm install
npm run check
npm test
npm run doctor
```

构建后也可运行：

```bash
node dist/src/cli/index.js doctor
node dist/src/cli/index.js agents
node dist/src/cli/index.js quota
# 预览，不消耗额度
node dist/src/cli/index.js run \
  --runtime codex \
  --prompt "Analyze this project" \
  --cwd . \
  --read-only \
  --dry-run

# 明确执行，会消耗所选 Runtime 的额度
printf 'Analyze this project' | node dist/src/cli/index.js run \
  --runtime codex \
  --prompt - \
  --cwd . \
  --read-only \
  --execute
```

## 作为 Pi 扩展试运行

```bash
pi -e ./src/extension/index.ts
```

进入 Pi 后：

```text
/fabric-agents
/fabric-quota
/fabric-dry-run codex Analyze this project
/fabric-run codex Analyze this project
```

## 安全原则

- 不读取或输出认证文件内容。
- 不通过抓取网页查询订阅额度。
- 无法精确查询的额度明确标记为 `unknown` 或 `inferred`。
- 外部 Agent 执行具备超时、取消、输出截断、脱敏日志和只读门禁。
- CLI 必须显式使用 `--execute`；Pi 扩展在执行前必须二次确认。
- Kimi 直接 Prompt 模式无法强制只读，因此当前拒绝自动执行。

项目的 North Star 和不可妥协原则见 [`docs/vision-and-principles.md`](docs/vision-and-principles.md)，架构见 [`docs/architecture.md`](docs/architecture.md)，V1 执行设计见 [`docs/runtime-execution.md`](docs/runtime-execution.md)。
