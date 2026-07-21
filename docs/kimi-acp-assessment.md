# Kimi ACP 安全评估

日期：2026-07-22

## 已确认能力

- 本机 Kimi Code `0.28.1` 提供 `kimi acp`，以 stdio 运行 Agent Client Protocol 服务。
- 官方 `@agentclientprotocol/sdk` 当前稳定入口为 ACP v1，许可证为 Apache-2.0。
- ACP Client 可以：
  - 不声明文件写入与 Terminal 能力；
  - 对 `session/request_permission` 返回取消；
  - 接收 `session/update` 中的文本、工具调用、计划和 Usage；
  - 通过 `session/cancel` 取消任务。

## 安全结论

ACP 改善了 Prompt 传输、事件标准化和权限交互，但它本身不是操作系统安全边界。Kimi Agent 进程仍以当前用户权限运行；即使 Client 拒绝权限请求，也不能证明 Agent 内部永远不会直接访问或修改工作区。

因此：

> 仅接入 ACP 不能把 Kimi 的 `readOnlyEnforcement` 从 `best-effort` 提升为 `native`。

## 推荐路径

1. 实现通用 ACP Client Adapter，默认不提供写文件和 Terminal 能力，并拒绝所有需要授权的工具。
2. 将 Kimi ACP 进程放入外部只读沙箱：容器、微型虚拟机或策略沙箱。
3. 使用只读挂载的项目副本执行端到端测试，验证拒绝写入、取消、超时和进程清理。
4. 只有 ACP 权限层与 OS 隔离层同时通过后，才允许 Kimi 自动执行。

在此之前，Kimi 保持发现、健康诊断和额度错误分类能力，但真实任务在进程启动前返回 `unsafe-execution`。
