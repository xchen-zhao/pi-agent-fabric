# Pi Agent Fabric

以 Pi 为统一入口的全局本地 Agent 编排项目，目标适配：

- Pi
- Claude Code
- Codex CLI
- Grok Build
- Kimi Code

长期能力包括额度感知路由、任务持久化、并发租约、Git worktree/沙箱隔离、跨模型审查和失败接力。

## 当前状态

当前为 **V0 Runtime Discovery**：只执行 `--version` 等无副作用命令，不发送模型请求，不消耗模型额度，不读取认证文件内容。

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
```

## 作为 Pi 扩展试运行

```bash
pi -e ./src/extension/index.ts
```

进入 Pi 后：

```text
/fabric-agents
/fabric-quota
```

## 安全原则

- 不读取或输出认证文件内容。
- 不通过抓取网页查询订阅额度。
- 无法精确查询的额度明确标记为 `unknown` 或 `inferred`。
- 外部 Agent 自动执行将在后续版本加入超时、输出截断、工作区隔离和配额租约。

架构见 [`docs/architecture.md`](docs/architecture.md)。
