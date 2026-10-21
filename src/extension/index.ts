import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { discoverRuntimes } from "../core/discovery.js";
import { createDryRunPlan, formatDryRunPlan } from "../core/dry-run.js";
import { executeAgent } from "../core/executor.js";
import { formatRuntimeTable } from "../core/format.js";
import { RUNTIME_IDS, type RuntimeId } from "../core/types.js";
import { loadQuotaSnapshots } from "../quota/state.js";
import { UsageLedger } from "../usage/ledger.js";

export default function agentFabricExtension(pi: ExtensionAPI): void {
  pi.registerCommand("fabric-agents", {
    description: "检测本机 Pi、Claude Code、Codex、Grok 和 Kimi Code",
    handler: async (_args, ctx) => {
      const runtimes = await discoverRuntimes();
      ctx.ui.notify(formatRuntimeTable(runtimes), "info");
    },
  });

  pi.registerCommand("fabric-quota", {
    description: "显示由本地 Usage Ledger 推导的 Agent 额度状态；不发送模型请求",
    handler: async (_args, ctx) => {
      const runtimes = await discoverRuntimes();
      const { snapshots } = loadQuotaSnapshots(runtimes);
      const lines = snapshots.map((quota) =>
        `${quota.runtime}: ${quota.state ?? "unknown"} / ${quota.status} (${quota.confidence}) - ${quota.note ?? "-"}`);
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("fabric-usage", {
    description: "显示本地 Agent Usage 汇总，不发送模型请求",
    handler: async (_args, ctx) => {
      const ledger = UsageLedger.open();
      try {
        const rows = ledger.summaries();
        const lines = rows.length === 0
          ? ["No recorded Agent runs."]
          : rows.map((row) => `${row.runtime}: runs=${row.runs}, ok=${row.completed}, failed=${row.failed}, input=${row.inputTokens}, output=${row.outputTokens}, cost=$${row.costUsd.toFixed(4)}`);
        ctx.ui.notify(lines.join("\n"), "info");
      } finally {
        ledger.close();
      }
    },
  });

  const parseRuntimeTask = (args: string): { runtime: RuntimeId; task: string } | undefined => {
    const [runtimeValue, ...taskParts] = args.trim().split(/\s+/);
    if (!runtimeValue || !RUNTIME_IDS.includes(runtimeValue as RuntimeId) || taskParts.length === 0) return undefined;
    return { runtime: runtimeValue as RuntimeId, task: taskParts.join(" ") };
  };

  pi.registerCommand("fabric-dry-run", {
    description: "预览 Runtime 只读执行计划：/fabric-dry-run <runtime> <task>",
    handler: async (args, ctx) => {
      const parsed = parseRuntimeTask(args);
      if (!parsed) {
        ctx.ui.notify(`Usage: /fabric-dry-run <${RUNTIME_IDS.join("|")}> <task>`, "warning");
        return;
      }
      const plan = await createDryRunPlan({
        runtime: parsed.runtime,
        prompt: parsed.task,
        cwd: ctx.cwd,
        mode: "read-only",
        timeoutMs: 600_000,
      });
      ctx.ui.notify(formatDryRunPlan(plan), "info");
    },
  });

  pi.registerCommand("fabric-run", {
    description: "明确启动一个只读 Agent，会消耗额度：/fabric-run <runtime> <task>",
    handler: async (args, ctx) => {
      const parsed = parseRuntimeTask(args);
      if (!parsed) {
        ctx.ui.notify(`Usage: /fabric-run <${RUNTIME_IDS.join("|")}> <task>`, "warning");
        return;
      }
      if (!ctx.hasUI) {
        throw new Error("/fabric-run requires interactive confirmation; use the fabric CLI with --execute for headless runs");
      }
      const approved = await ctx.ui.confirm(
        "Run external Agent?",
        `Runtime: ${parsed.runtime}\nMode: read-only\nTask: ${parsed.task}\n\nThis consumes the selected runtime's quota.`,
      );
      if (!approved) return;

      ctx.ui.setStatus("agent-fabric", `Running ${parsed.runtime}...`);
      try {
        const request = {
          runtime: parsed.runtime,
          prompt: parsed.task,
          cwd: ctx.cwd,
          mode: "read-only" as const,
          timeoutMs: 600_000,
        };
        const startedAt = new Date();
        const result = await executeAgent(request);
        try {
          const ledger = UsageLedger.open();
          try {
            ledger.record(request, result, startedAt);
          } finally {
            ledger.close();
          }
        } catch (error) {
          ctx.ui.notify(`Usage recording failed: ${error instanceof Error ? error.message : String(error)}`, "warning");
        }
        const summary = result.status === "completed"
          ? `${result.text}\n\nUsage: ${JSON.stringify(result.usage)}\nLog: ${result.process.fullOutputPath ?? "-"}`
          : `${result.error?.category ?? "unknown"}: ${result.error?.message ?? "Execution failed"}`;
        ctx.ui.notify(summary, result.status === "completed" ? "info" : "error");
      } finally {
        ctx.ui.setStatus("agent-fabric", undefined);
      }
    },
  });
}
