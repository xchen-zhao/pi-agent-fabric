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

1. Pi 是控制入口，不直接承载所有 Runtime 差异。
2. 每个外部 Agent 由独立 Adapter 封装命令、事件和错误。
3. 额度信息携带来源和置信度，未知就是未知。
4. 调度前申请额度与并发租约，执行后结算实际消耗。
5. 写任务使用 Git worktree、容器或其他隔离工作区。
6. Agent 接力通过结构化 Checkpoint、Commit 和测试结果完成。

## 路线图

- V0：Runtime Discovery 和只读 Doctor。
- V1：额度探测、SQLite Usage Ledger、错误分类。
- V2：统一 delegate、单 Agent 运行、取消和输出归一化。
- V3：能力/额度路由、并发租约和失败切换。
- V4：任务 DAG、worktree、Review Gate 和 Dashboard。
