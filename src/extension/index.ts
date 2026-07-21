import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { discoverRuntimes } from "../core/discovery.js";
import { createDryRunPlan, formatDryRunPlan } from "../core/dry-run.js";
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

  pi.registerCommand("fabric-dry-run", {
    description: "预览 Runtime 只读执行计划：/fabric-dry-run <runtime> <task>",
    handler: async (args, ctx) => {
      const [runtimeValue, ...taskParts] = args.trim().split(/\s+/);
      if (!runtimeValue || !RUNTIME_IDS.includes(runtimeValue as RuntimeId) || taskParts.length === 0) {
        ctx.ui.notify(`Usage: /fabric-dry-run <${RUNTIME_IDS.join("|")}> <task>`, "warning");
        return;
      }
      const plan = await createDryRunPlan({
        runtime: runtimeValue as RuntimeId,
        prompt: taskParts.join(" "),
        cwd: ctx.cwd,
        mode: "read-only",
        timeoutMs: 600_000,
      });
      ctx.ui.notify(formatDryRunPlan(plan), "info");
    },
  });
}
