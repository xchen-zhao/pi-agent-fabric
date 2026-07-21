#!/usr/bin/env node
import { discoverRuntimes } from "../core/discovery.js";
import { formatDetailedReport, formatRuntimeTable } from "../core/format.js";
import { initialQuotaSnapshot } from "../quota/broker.js";

function usage(): void {
  console.log(`Usage: fabric <command> [--json]\n\nCommands:\n  doctor   Runtime 安装、版本和能力诊断\n  agents   列出可用 Agent Runtime\n  quota    显示安全的额度探测结果（V0 不发送模型请求）`);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const json = process.argv.includes("--json");
  if (!command || command === "help" || command === "--help" || command === "-h") {
    usage();
    return;
  }

  const runtimes = await discoverRuntimes();
  if (command === "doctor") {
    console.log(json ? JSON.stringify(runtimes, null, 2) : formatDetailedReport(runtimes));
    return;
  }
  if (command === "agents") {
    console.log(json ? JSON.stringify(runtimes, null, 2) : formatRuntimeTable(runtimes));
    return;
  }
  if (command === "quota") {
    const snapshots = runtimes.map(initialQuotaSnapshot);
    if (json) {
      console.log(JSON.stringify(snapshots, null, 2));
    } else {
      console.log("Runtime      Status        Confidence  Note");
      console.log("-----------  ------------  ----------  ------------------------");
      for (const snapshot of snapshots) {
        const runtime = snapshot.runtime.padEnd(11);
        const status = snapshot.status.padEnd(12);
        const confidence = snapshot.confidence.padEnd(10);
        console.log(`${runtime}  ${status}  ${confidence}  ${snapshot.note ?? "-"}`);
      }
    }
    return;
  }

  console.error(`Unknown command: ${command}`);
  usage();
  process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
