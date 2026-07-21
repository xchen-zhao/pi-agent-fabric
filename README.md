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

当前处于 **V1 Runtime Execution**：已完成 Runtime Discovery、内部 Adapter 协议、五种只读命令计划、Process Supervisor 和 Dry Run。`fabric run` 暂不启动真实 Agent，不发送模型请求，也不消耗模型额度。

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
node dist/src/cli/index.js run \
  --runtime codex \
  --prompt "Analyze this project" \
  --cwd . \
  --read-only \
  --dry-run
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
```

## 安全原则

- 不读取或输出认证文件内容。
- 不通过抓取网页查询订阅额度。
- 无法精确查询的额度明确标记为 `unknown` 或 `inferred`。
- 外部 Agent 自动执行将在后续版本加入超时、输出截断、工作区隔离和配额租约。

项目的 North Star 和不可妥协原则见 [`docs/vision-and-principles.md`](docs/vision-and-principles.md)，架构见 [`docs/architecture.md`](docs/architecture.md)，V1 执行设计见 [`docs/runtime-execution.md`](docs/runtime-execution.md)。
