import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { discoverRuntimes } from "../core/discovery.js";
import { createDryRunPlan, formatDryRunPlan } from "../core/dry-run.js";
import { executeAgent } from "../core/executor.js";
import { formatRuntimeTable } from "../core/format.js";
import { RUNTIME_IDS, type RuntimeId } from "../core/types.js";
import { initialQuotaSnapshot } from "../quota/broker.js";

export default function agentFabricExtension(pi: ExtensionAPI): void {
  pi.registerCommand("fabric-agents", {
    description: "检测本机 Pi、Claude Code、Codex、Grok 和 Kimi Code",
    handler: async (_args, ctx) => {
      const runtimes = await discoverRuntimes();
      ctx.ui.notify(formatRuntimeTable(runtimes), "info");
    },
  });

  pi.registerCommand("fabric-quota", {
    description: "显示 Agent 额度状态；V0 只读且不发送模型请求",
    handler: async (_args, ctx) => {
      const runtimes = await discoverRuntimes();
      const lines = runtimes.map((runtime) => {
        const quota = initialQuotaSnapshot(runtime);
        return `${runtime.displayName}: ${quota.status} (${quota.confidence}) - ${quota.note ?? "-"}`;
      });
      ctx.ui.notify(lines.join("\n"), "info");
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
        const result = await executeAgent({
          runtime: parsed.runtime,
          prompt: parsed.task,
          cwd: ctx.cwd,
          mode: "read-only",
          timeoutMs: 600_000,
        });
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
