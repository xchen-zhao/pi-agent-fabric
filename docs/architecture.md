# 架构设计

## 分层

```text
Pi Extension / fabric CLI
          │
          ▼
Orchestrator + Scheduler
          │
    ┌─────┴─────┐
    ▼           ▼
Runtime       Quota Broker
Adapters      + Usage Ledger
    │           │
    └─────┬─────┘
          ▼
Workspace Manager
```

## 设计原则

项目所有架构决策必须遵守 [`vision-and-principles.md`](vision-and-principles.md)。技术层面的约束包括：

1. Pi 是控制入口，不直接承载所有 Runtime 差异。
2. 每个外部 Agent 由独立 Adapter 封装命令、事件和错误。
3. 额度信息携带来源和置信度，未知就是未知。
4. 调度前申请额度与并发租约，执行后结算实际消耗。
5. 写任务使用 Git worktree、容器或其他隔离工作区。
6. Agent 接力通过结构化 Checkpoint、Commit 和测试结果完成。
7. 所有自动决策必须保留可解释的原因和审计记录。
8. 核心只定义协议、状态和安全边界，厂商能力由 Adapter 扩展。

## 路线图

- V0：Runtime Discovery 和只读 Doctor。
- V1：统一 Runtime 执行协议、单 Agent 运行、取消和输出归一化。
- V1.1：安全 Prompt 通道、健康状态、错误分类和本地 Usage Ledger。
- V1.2：可用性路由和安全 fallback。
- V2：额度感知调度、并发租约和失败接力。
- V3：任务 DAG、worktree、Review Gate 和恢复机制。
- V4：插件生态、可解释调度界面和 Dashboard。
