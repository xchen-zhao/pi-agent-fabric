# Pi Agent Fabric

> Build the open, local-first, vendor-neutral orchestration fabric that developers trust to coordinate any AI agent—safely, transparently, and reliably.

[English](README.md)

以 Pi 为统一入口的全局本地 Agent 编排项目。它不是另一个 Agent，而是让不同 Agent 安全、透明、可靠地协同工作并实现 1+1>2 的基础设施。

目标适配：

- Pi
- Claude Code
- Codex CLI
- Grok Build
- Kimi Code

长期能力包括额度感知路由、任务持久化、并发租约、Git worktree/沙箱隔离、跨模型审查和失败接力。

## 当前状态

当前已完成 **V1.1 Runtime Hardening** 和 **V1.2 最小版可用性路由**：具备统一 Executor、安全 Prompt 通道、JSONL 事件归一化、本地 Usage Ledger 和错误/额度信号。Pi、Claude、Codex、Grok 已通过端到端只读复测；Kimi 在 ACP 与 OS 沙箱双重保护完成前会被拒绝执行。

## 额度感知路由（最小版）

`quota` 命令只根据本地事实推导每个 Runtime 的状态：是否安装，以及 Usage Ledger 中近期运行记录的限流、额度耗尽、认证失败信号。

- `available`：最近一次运行成功（推断，不代表供应商保证）。
- `limited`：最近一次运行报告限流/额度耗尽/冷却/认证失败，且仍在冷却窗口内。冷却时间优先使用 Runtime 报告的重置时间，其次是输出中的 `retry-after`，否则默认限流 15 分钟、额度耗尽或认证失败 60 分钟，可用 `--cooldown-minutes`、`--quota-cooldown-minutes` 调整。
- `unknown`：未安装、无近期记录、冷却已过但没有新的成功运行，或与额度无关的失败。

`run --runtime auto` 按 `--priority`（或环境变量 `PI_AGENT_FABRIC_PRIORITY`，默认 `pi,claude,codex,grok`）先选 `available`，再选 `unknown`，跳过 `limited`、未安装的 Runtime；按现有安全策略永不自动选择 Kimi。路由只在执行前进行一次，执行中失败不会自动切换到下一个 Runtime（尚未实现）。

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
node dist/src/cli/index.js usage --recent 10

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
/fabric-usage
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

项目的 North Star 和不可妥协原则见 [`docs/vision-and-principles.md`](docs/vision-and-principles.md)，架构见 [`docs/architecture.md`](docs/architecture.md)，V1 执行设计见 [`docs/runtime-execution.md`](docs/runtime-execution.md)，本地用量记录见 [`docs/usage-ledger.md`](docs/usage-ledger.md)，Kimi 安全结论见 [`docs/kimi-acp-assessment.md`](docs/kimi-acp-assessment.md)。
