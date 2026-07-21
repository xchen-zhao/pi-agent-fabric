#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { discoverRuntimes } from "../core/discovery.js";
import { createDryRunPlan, formatDryRunPlan } from "../core/dry-run.js";
import { executeAgent } from "../core/executor.js";
import type { AgentEvent, ExecutionRequest } from "../core/execution-types.js";
import { formatDetailedReport, formatRuntimeTable } from "../core/format.js";
import { RUNTIME_IDS, type RuntimeId } from "../core/types.js";
import { initialQuotaSnapshot } from "../quota/broker.js";

function usage(): void {
  console.log(`Usage: fabric <command> [options]\n\nCommands:\n  doctor                         Runtime 安装、版本和能力诊断\n  agents                         列出可用 Agent Runtime\n  quota                          显示安全的额度探测结果\n  run --runtime <id>             执行或预览统一只读 Agent 任务\n\nRun options:\n  --prompt <text|->              任务提示词；- 表示从 stdin 读取\n  --prompt-file <path>           从 UTF-8 文件读取任务提示词\n  --cwd <path>                   工作目录，默认为当前目录\n  --read-only                    只读执行模式（当前唯一模式）\n  --timeout-seconds <seconds>    超时，默认 600 秒\n  --dry-run                      只展示执行计划，不启动 Agent\n  --execute                      明确启动 Agent；会消耗对应额度\n  --json                         输出归一化 JSONL 事件和最终结果`);
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

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function readPrompt(args: string[]): Promise<string> {
  const inline = optionValue(args, "--prompt");
  const promptFile = optionValue(args, "--prompt-file");
  if (inline !== undefined && promptFile !== undefined) {
    throw new Error("Use exactly one of --prompt or --prompt-file");
  }
  const prompt = promptFile !== undefined
    ? await readFile(path.resolve(promptFile), "utf8")
    : inline === "-"
      ? await readStdin()
      : inline;
  if (prompt === undefined) throw new Error("Missing --prompt or --prompt-file");
  if (prompt.trim().length === 0) throw new Error("Prompt must not be empty");
  return prompt;
}

function printTextResult(result: Awaited<ReturnType<typeof executeAgent>>): void {
  if (result.text && !result.text.endsWith("\n")) process.stdout.write("\n");
  console.log(`Status: ${result.status}`);
  console.log(`Duration: ${result.process.durationMs}ms`);
  if (Object.keys(result.usage).length > 0) console.log(`Usage: ${JSON.stringify(result.usage)}`);
  if (result.quota) console.log(`Quota: ${result.quota.status} (${result.quota.confidence})`);
  if (result.error) console.log(`Error: ${result.error.category} - ${result.error.message}`);
  if (result.process.fullOutputPath) console.log(`Log: ${result.process.fullOutputPath}`);
}

async function runAgent(args: string[], json: boolean): Promise<void> {
  const dryRun = args.includes("--dry-run");
  const execute = args.includes("--execute");
  if (dryRun === execute) throw new Error("Use exactly one of --dry-run or --execute");
  if (!args.includes("--read-only")) throw new Error("V1 requires --read-only");

  const request: ExecutionRequest = {
    runtime: parseRuntime(optionValue(args, "--runtime")),
    prompt: await readPrompt(args),
    cwd: path.resolve(optionValue(args, "--cwd") ?? process.cwd()),
    mode: "read-only",
    timeoutMs: parsePositiveSeconds(optionValue(args, "--timeout-seconds")),
  };

  if (dryRun) {
    const plan = await createDryRunPlan(request);
    console.log(json ? JSON.stringify(plan, null, 2) : formatDryRunPlan(plan));
    return;
  }

  const onEvent = (event: AgentEvent): void => {
    if (json) console.log(JSON.stringify(event));
    else if (event.type === "message.delta") process.stdout.write(event.text);
  };
  const result = await executeAgent(request, { onEvent });
  if (json) console.log(JSON.stringify({ type: "run.result", result }));
  else printTextResult(result);
  if (result.status === "failed") process.exitCode = 1;
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
    await runAgent(args, json);
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
