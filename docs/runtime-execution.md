# Runtime Execution V1

## 目标

将同一个只读 `ExecutionRequest` 转换为 Pi、Claude Code、Codex CLI、Grok 和 Kimi Code 的安全命令计划，并在后续阶段统一为 `AgentEvent` 和 `ProcessResult`。

## 当前边界

- 已定义内部实验版 `AgentRuntimeAdapter`，尚不承诺公开 API 稳定性。
- 已实现五个 Runtime 的命令构建器；Pi、Claude、Codex 和 Grok 提供原生只读约束，Kimi 直接 Prompt 模式目前只能标记为 `best-effort`。
- 已实现超时、取消、进程组终止、输出限制、日志和基础脱敏的 Process Supervisor。
- 已通过最小真实 Smoke Test 验证 Pi、Claude、Codex 和 Grok 的 JSONL；Kimi 准确识别到当前计费周期额度已耗尽。
- 已为四个成功 Runtime 建立脱敏 Fixture 和基础事件 Parser，并解析 Claude 报告的限流窗口。
- 已实现统一 Executor，将 Adapter、Process Supervisor、Parser、错误分类、Usage、Quota Signal 和最终 `AgentResult` 串联。
- Pi、Claude、Codex 和 Grok 已通过统一 CLI 的端到端只读复测；Kimi 在启动进程前被安全门禁拒绝。
- `fabric run` 必须明确二选一：`--dry-run` 不消耗额度，`--execute` 启动 Agent 并消耗对应额度。

## Dry Run

```bash
fabric run \
  --runtime codex \
  --prompt "Analyze this project" \
  --cwd . \
  --read-only \
  --dry-run
```

Pi 扩展中可使用：

```text
/fabric-dry-run codex Analyze this project
/fabric-run codex Analyze this project
```

`/fabric-run` 在 TUI/RPC 中执行前必须由用户二次确认；无 UI 的扩展命令拒绝执行。Headless 自动化应使用 CLI 的显式 `--execute`。

## 安全设计

- 使用 `spawn(command, args, { shell: false })`，不经过 Shell 拼接。
- Pi、Claude Code 和 Codex 的 Prompt 通过 stdin 传递，不出现在进程参数中。
- 自动化命令默认关闭或忽略非必要的用户扩展能力：Pi 禁用 Extensions/Skills/Templates，Claude 使用 Safe Mode，Codex 忽略用户配置和 Rules，Grok 禁用 Memory/Web Search/Subagents。项目上下文继承策略将在统一 Executor 中显式定义，不能依赖隐式插件副作用。
- Grok 和 Kimi 当前 CLI 模式需要参数传递 Prompt；Dry Run 会将其替换为长度占位符。真实执行前需继续评估 Grok 的 prompt-file 与 Kimi ACP，降低进程列表泄漏风险。
- Kimi 的 `--prompt` 与 `--plan` 不能同时使用，因此直接 CLI Prompt 模式不具备可接受的强制只读边界；在 ACP 或外部沙箱完成前，不应开放自动执行。
- 日志默认写入 `~/.local/share/pi-agent-fabric/runs/`，目录权限为 `0700`、文件权限为 `0600`。
- 日志与返回输出均先执行基础 Token/密钥脱敏。
- 上下文输出默认最多保留 50KB/2000 行，完整的脱敏输出保存在日志文件中。
- 超时或取消时先终止整个进程组，5 秒后仍未退出则强制终止。

## 下一步

1. 完善工具调用、失败和中断事件 Fixture。
2. 为 Kimi 评估 ACP 或外部沙箱执行路径。
3. 将认证、限流、额度不足和模型不可用归一化为稳定错误分类。
4. 设计本地 Usage Ledger，但不把推断数据伪装成精确额度。
5. 在统一执行稳定后再增加供父 Agent 调用的委派工具。
