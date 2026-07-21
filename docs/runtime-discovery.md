# Runtime Discovery

初次探测日期：2026-07-22。

| Runtime | 本机命令 | 已确认的非交互能力 | 原生额度查询 |
|---|---|---|---|
| Pi | `pi` | print、JSON、RPC、SDK | 未发现统一接口；取决于 Provider |
| Claude Code | `claude` | `--print`、json、stream-json、JSON Schema | 未发现稳定 CLI 接口 |
| Codex CLI | `codex` | `exec --json`、output schema、resume | 未发现稳定 CLI 接口 |
| Grok Build | `grok` | single、json、streaming-json、JSON Schema、worktree | 未发现稳定 CLI 接口 |
| Kimi Code | `kimi` | prompt、stream-json、ACP、resume | 未发现稳定 CLI 接口 |

## V0 边界

- 只运行版本命令。
- 认证状态仅通过已知标记文件是否存在判断，不读取内容。
- 不执行测试 Prompt，不消耗额度。
- 不将“已配置认证”解释为“认证一定有效”。
- 不将本地调用次数估算成精确订阅余额。
