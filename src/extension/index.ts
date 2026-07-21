import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { discoverRuntimes } from "../core/discovery.js";
import { formatRuntimeTable } from "../core/format.js";
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
}
