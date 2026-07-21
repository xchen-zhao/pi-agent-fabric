# Usage Ledger

## 目标

Usage Ledger 记录本地 Agent 运行元数据，为后续健康判断、成本观察和额度感知调度提供事实基础。它不声称等同于供应商账单或精确剩余额度。

## 默认位置

```text
~/.local/share/pi-agent-fabric/fabric.db
```

数据库文件权限为 `0600`，父目录由 Agent Fabric 使用私有目录。测试或隔离环境可设置：

```bash
PI_AGENT_FABRIC_LEDGER_PATH=:memory:
```

也可以设置为自定义 SQLite 文件路径。

## 记录内容

- Runtime、模式、成功/失败状态；
- 开始/结束时间和耗时；
- Input、Output、Cache Read、Cache Write Token；
- Runtime 报告的成本；
- 错误分类；
- Quota Signal 的状态、置信度和重置时间；
- 本地脱敏日志路径。

## 明确不记录

- Prompt；
- Agent 最终文本；
- 工作区路径；
- API Key、Token、Cookie 和认证文件内容；
- 完整供应商原始响应。

## 使用

```bash
fabric usage
fabric usage --recent 10
fabric usage --recent 10 --json
```

Ledger 只反映本机 Agent Fabric 实际观察到的运行。绕过 Agent Fabric 直接调用 CLI 的消耗不会被记录；供应商侧缓存、计费和订阅策略也可能与本地数据不同。
