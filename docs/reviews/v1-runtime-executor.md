# V1 Runtime Executor 复盘

日期：2026-07-22

## 完成范围

- 将 Runtime Adapter、Process Supervisor、JSONL Parser 和错误分类串联为统一 Executor。
- 输出归一化 `AgentEvent` 与 `AgentResult`。
- CLI 使用 `--dry-run`/`--execute` 显式二选一，支持 stdin 和 Prompt File。
- Pi 扩展的真实执行必须经过用户二次确认。
- 非原生只读 Runtime 在进程启动前拒绝执行。

## 审查中发现并修正

1. Parser 回调异常可能导致宿主进程崩溃：改为收敛为 `invalid-output`。
2. 进程工作目录错误未归类：增加 `spawn-failed`。
3. Pi 扩展执行缺少二次确认：增加 TUI/RPC 确认，无 UI 时拒绝。
4. Kimi `--prompt` 与 `--plan` 不兼容：标记为 `best-effort` 并由 Executor 拒绝。
5. CLI Prompt 可能出现在父 CLI 参数中：增加 stdin 与 Prompt File 输入；Pi、Claude、Codex 向子进程继续使用 stdin。
6. Supervisor 取消和日志脱敏缺少集成测试：已补充。

## 复测结果

- TypeScript 严格类型检查通过。
- 28 项自动化测试全部通过。
- Pi Extension 离线加载通过。
- 五个 Runtime Dry Run 通过。
- Pi、Claude、Codex、Grok 通过统一 CLI 端到端只读执行并返回 `OK`。
- Kimi 在进程启动前按设计返回 `unsafe-execution`。
- `npm audit --omit=dev`：0 个运行时漏洞。

## 遗留风险

- Grok 和 Kimi 的直接 CLI Prompt 仍通过进程参数传递；Grok 后续应切换 `--prompt-file`，Kimi 优先评估 ACP。
- 当前事件 Fixture 主要覆盖文本、Usage、Quota Signal 和完成事件，工具调用、认证失败、中断及多轮事件仍需补齐。
- 基础日志脱敏不能证明覆盖所有厂商未来新增的敏感字段，需要可扩展脱敏策略和输出 Schema。
- 开发依赖 `@earendil-works/pi-coding-agent` 的传递依赖 `protobufjs` 存在一个 moderate 级 DoS 公告；运行时依赖审计为 0，后续跟踪上游升级。
- 当前只支持单 Runtime 执行，尚未实现任务持久化、Usage Ledger、并发租约和恢复。

## 下一步

优先补齐错误/工具事件 Fixture 和 Kimi/Grok 安全 Prompt 通道，然后设计 Usage Ledger。不得在单 Runtime 执行稳定前提前引入多 Agent 并发。
