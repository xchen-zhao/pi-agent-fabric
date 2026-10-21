#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { discoverRuntimes } from "../core/discovery.js";
import { createDryRunPlan, formatDryRunPlan } from "../core/dry-run.js";
import { executeAgent } from "../core/executor.js";
import type { AgentEvent, ExecutionRequest } from "../core/execution-types.js";
import { formatDetailedReport, formatRuntimeTable } from "../core/format.js";
import { RUNTIME_IDS, type RuntimeId } from "../core/types.js";
import type { QuotaDerivationOptions } from "../quota/broker.js";
import { parsePriority, selectRuntime, type RouteDecision } from "../quota/router.js";
import { loadQuotaSnapshots } from "../quota/state.js";
import type { QuotaSnapshot } from "../quota/types.js";
import { cleanupStaleTempDirs } from "../core/execution-supervisor.js";
import { UsageLedger, type UsageSummary } from "../usage/ledger.js";

function usage(): void {
  console.log(`Usage: fabric <command> [options]

Commands:
  doctor                         Runtime install, version and capability diagnostics
  agents                         List detected Agent runtimes
  quota                          Show quota state derived from the local Usage Ledger
  usage [--recent <n>]           Show aggregated local usage and recent runs
  run --runtime <id|auto>        Execute or preview a unified read-only Agent task

Run options:
  --runtime auto                 Pick an eligible runtime by quota state + priority
  --priority <ids>               Comma-separated order for auto, e.g. codex,claude,pi
                                 (default: env PI_AGENT_FABRIC_PRIORITY or pi,claude,codex,grok)
  --prompt <text|->              Task prompt; - reads from stdin
  --prompt-file <path>           Read the prompt from a UTF-8 file
  --cwd <path>                   Working directory, defaults to the current directory
  --read-only                    Read-only execution (the only mode today; required)
  --timeout-seconds <seconds>    Timeout, default 600 seconds
  --dry-run                      Show the execution plan without starting an Agent
  --execute                      Actually start the Agent; consumes that runtime's quota
  --json                         Emit normalized JSONL events and the final result

Quota options (quota, run --runtime auto):
  --cooldown-minutes <n>         Cooldown after a rate-limit signal without retry-after (default 15)
  --quota-cooldown-minutes <n>   Cooldown after an exhausted-quota or auth signal (default 60)`);
}

function optionValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
  return value;
}

function parsePositiveMinutes(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) throw new Error(`${name} must be a positive number`);
  return Math.round(minutes * 60_000);
}

function quotaOptions(args: string[]): QuotaDerivationOptions {
  const rate = parsePositiveMinutes(optionValue(args, "--cooldown-minutes"), "--cooldown-minutes");
  const quota = parsePositiveMinutes(optionValue(args, "--quota-cooldown-minutes"), "--quota-cooldown-minutes");
  return {
    ...(rate === undefined ? {} : { rateLimitCooldownMs: rate }),
    ...(quota === undefined ? {} : { quotaCooldownMs: quota, authCooldownMs: quota }),
  };
}

function formatQuotaTable(snapshots: QuotaSnapshot[]): string {
  const header = "Runtime      State      Status        Confidence  Cooldown Until             Note";
  const divider = "-----------  ---------  ------------  ----------  ------------------------  ------------------------";
  const lines = snapshots.map((snapshot) => [
    snapshot.runtime.padEnd(11),
    (snapshot.state ?? "unknown").padEnd(9),
    snapshot.status.padEnd(12),
    snapshot.confidence.padEnd(10),
    (snapshot.cooldownUntil ?? "-").padEnd(24),
    snapshot.note ?? "-",
  ].join("  "));
  return [header, divider, ...lines].join("\n");
}

async function routeAuto(args: string[]): Promise<RouteDecision> {
  const priority = parsePriority(optionValue(args, "--priority") ?? process.env.PI_AGENT_FABRIC_PRIORITY);
  const runtimes = await discoverRuntimes();
  const { snapshots, warning } = loadQuotaSnapshots(runtimes, quotaOptions(args));
  if (warning) console.error(`Warning: ${warning}`);
  return selectRuntime(runtimes, snapshots, priority);
}

function parseRuntime(value: string | undefined): RuntimeId {
  if (!value || !RUNTIME_IDS.includes(value as RuntimeId)) {
    throw new Error(`Invalid --runtime. Expected auto or one of: ${RUNTIME_IDS.join(", ")}`);
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

function formatUsageSummary(rows: UsageSummary[]): string {
  if (rows.length === 0) return "No recorded Agent runs.";
  const header = "Runtime      Runs  OK  Failed  Input     Output    Cache Read  Cache Write  Cost USD";
  const divider = "-----------  ----  --  ------  --------  --------  ----------  -----------  --------";
  const lines = rows.map((row) => [
    row.runtime.padEnd(11),
    String(row.runs).padStart(4),
    String(row.completed).padStart(2),
    String(row.failed).padStart(6),
    String(row.inputTokens).padStart(8),
    String(row.outputTokens).padStart(8),
    String(row.cacheReadTokens).padStart(10),
    String(row.cacheWriteTokens).padStart(11),
    row.costUsd.toFixed(4).padStart(8),
  ].join("  "));
  return [header, divider, ...lines].join("\n");
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

  const runtimeValue = optionValue(args, "--runtime");
  let runtime: RuntimeId;
  let route: RouteDecision | undefined;
  if (runtimeValue === "auto") {
    route = await routeAuto(args);
    if (!route.selected) throw new Error(route.reason);
    runtime = route.selected;
    if (json) console.log(JSON.stringify({ type: "route.selected", runtime, reason: route.reason, candidates: route.candidates }));
    else console.error(`Auto-selected runtime: ${route.reason}`);
  } else {
    runtime = parseRuntime(runtimeValue);
  }

  const request: ExecutionRequest = {
    runtime,
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
  await cleanupStaleTempDirs();
  const startedAt = new Date();
  const result = await executeAgent(request, { onEvent });
  try {
    const ledger = UsageLedger.open();
    try {
      ledger.record(request, result, startedAt);
    } finally {
      ledger.close();
    }
  } catch (error) {
    console.error(`Warning: failed to record usage: ${error instanceof Error ? error.message : String(error)}`);
  }
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

  if (command === "usage") {
    const ledger = UsageLedger.open();
    try {
      const summaries = ledger.summaries();
      const recentValue = optionValue(args, "--recent");
      const recent = recentValue === undefined ? [] : ledger.recent(Number(recentValue));
      if (json) console.log(JSON.stringify({ summaries, recent }, null, 2));
      else {
        console.log(formatUsageSummary(summaries));
        if (recent.length > 0) {
          console.log("\nRecent runs:");
          for (const run of recent) {
            console.log(`${run.finishedAt}  ${run.runtime}  ${run.status}  ${run.durationMs}ms${run.errorCategory ? `  ${run.errorCategory}` : ""}`);
          }
        }
      }
    } finally {
      ledger.close();
    }
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
    const { snapshots, warning } = loadQuotaSnapshots(runtimes, quotaOptions(args));
    if (warning) console.error(`Warning: ${warning}`);
    console.log(json ? JSON.stringify(snapshots, null, 2) : formatQuotaTable(snapshots));
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
