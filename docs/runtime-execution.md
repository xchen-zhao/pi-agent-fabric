# Runtime Execution V1

## 目标

将同一个只读 `ExecutionRequest` 转换为 Pi、Claude Code、Codex CLI、Grok 和 Kimi Code 的安全命令计划，并在后续阶段统一为 `AgentEvent` 和 `ProcessResult`。

## 当前边界

- 已定义内部实验版 `AgentRuntimeAdapter`，尚不承诺公开 API 稳定性。
- 已实现五个 Runtime 的只读命令构建器。
- 已实现超时、取消、进程组终止、输出限制、日志和基础脱敏的 Process Supervisor。
- `fabric run` 当前强制要求 `--read-only --dry-run`，不会启动 Agent 或消耗模型额度。
- 尚未启用真实执行和各 Runtime 的事件解析。

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
```

## 安全设计

- 使用 `spawn(command, args, { shell: false })`，不经过 Shell 拼接。
- Pi、Claude Code 和 Codex 的 Prompt 通过 stdin 传递，不出现在进程参数中。
- Grok 和 Kimi 当前 CLI 模式需要参数传递 Prompt；Dry Run 会将其替换为长度占位符。真实执行前需继续评估 Grok 的 prompt-file 与 Kimi ACP，降低进程列表泄漏风险。
- 日志默认写入 `~/.local/share/pi-agent-fabric/runs/`，目录权限为 `0700`、文件权限为 `0600`。
- 日志与返回输出均先执行基础 Token/密钥脱敏。
- 上下文输出默认最多保留 50KB/2000 行，完整的脱敏输出保存在日志文件中。
- 超时或取消时先终止整个进程组，5 秒后仍未退出则强制终止。

## 下一步

1. 为五种 JSON/JSONL 流建立 Fixture 和事件 Parser。
2. 通过用户明确确认的最小真实请求采集输出格式。
3. 启用单 Runtime 只读执行。
4. 将认证、限流、额度不足和模型不可用归一化为稳定错误分类。
