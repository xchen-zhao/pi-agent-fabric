#!/usr/bin/env node
import path from "node:path";
import { discoverRuntimes } from "../core/discovery.js";
import { createDryRunPlan, formatDryRunPlan } from "../core/dry-run.js";
import type { ExecutionRequest } from "../core/execution-types.js";
import { formatDetailedReport, formatRuntimeTable } from "../core/format.js";
import { RUNTIME_IDS, type RuntimeId } from "../core/types.js";
import { initialQuotaSnapshot } from "../quota/broker.js";

function usage(): void {
  console.log(`Usage: fabric <command> [options]\n\nCommands:\n  doctor                         Runtime 安装、版本和能力诊断\n  agents                         列出可用 Agent Runtime\n  quota                          显示安全的额度探测结果\n  run --runtime <id>             构建统一执行计划（V1 仅支持 --dry-run）\n\nRun options:\n  --prompt <text>                任务提示词\n  --cwd <path>                   工作目录，默认为当前目录\n  --read-only                    只读执行模式（当前唯一模式）\n  --timeout-seconds <seconds>    超时，默认 600 秒\n  --dry-run                      只展示执行计划，不启动 Agent\n  --json                         输出 JSON`);
}

function optionValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
  return value;
}

function parseRuntime(value: string | undefined): RuntimeId {
  if (!value || !RUNTIME_IDS.includes(value as RuntimeId)) {
    throw new Error(`Invalid --runtime. Expected one of: ${RUNTIME_IDS.join(", ")}`);
  }
  return value as RuntimeId;
}

function parsePositiveSeconds(value: string | undefined): number {
  if (value === undefined) return 600_000;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("--timeout-seconds must be a positive number");
  return Math.round(seconds * 1_000);
}

async function runDry(args: string[], json: boolean): Promise<void> {
  if (!args.includes("--dry-run")) {
    throw new Error("Live Agent execution is not enabled in V1 yet. Use --dry-run.");
  }
  if (!args.includes("--read-only")) {
    throw new Error("V1 requires --read-only.");
  }
  const prompt = optionValue(args, "--prompt");
  if (!prompt) throw new Error("Missing --prompt");

  const request: ExecutionRequest = {
    runtime: parseRuntime(optionValue(args, "--runtime")),
    prompt,
    cwd: path.resolve(optionValue(args, "--cwd") ?? process.cwd()),
    mode: "read-only",
    timeoutMs: parsePositiveSeconds(optionValue(args, "--timeout-seconds")),
  };
  const plan = await createDryRunPlan(request);
  console.log(json ? JSON.stringify(plan, null, 2) : formatDryRunPlan(plan));
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const args = process.argv.slice(3);
  const json = args.includes("--json");
  if (!command || command === "help" || command === "--help" || command === "-h") {
    usage();
    return;
  }

  if (command === "run") {
    await runDry(args, json);
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
