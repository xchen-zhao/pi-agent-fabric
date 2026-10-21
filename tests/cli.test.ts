import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import { promisify } from "node:util";
import path from "node:path";
import test from "node:test";
import type { AgentResult, ExecutionRequest } from "../src/core/execution-types.js";
import { UsageLedger } from "../src/usage/ledger.js";

const execFileAsync = promisify(execFile);
const cli = path.resolve("dist", "src", "cli", "index.js");

// Fake runtime executables so CLI tests never depend on locally installed Agents.
// Dry-run only resolves the executable and never starts it.
const fakeBin = mkdtempSync(path.join(os.tmpdir(), "fabric-fake-bin-"));
for (const name of ["pi", "claude", "codex", "grok"]) {
  const file = path.join(fakeBin, name);
  writeFileSync(file, "#!/bin/sh\necho fake-runtime-should-not-run >&2\nexit 99\n");
  chmodSync(file, 0o755);
}
const isolatedPath = [fakeBin, path.dirname(process.execPath), "/usr/bin", "/bin"].join(path.delimiter);
const testOptions = {
  env: { ...process.env, PATH: isolatedPath, PI_AGENT_FABRIC_LEDGER_PATH: ":memory:", PI_AGENT_FABRIC_PRIORITY: "" },
};

function failedRun(runtime: ExecutionRequest["runtime"], category: "rate-limited" | "quota-exhausted"): [ExecutionRequest, AgentResult] {
  return [
    { runtime, prompt: "x", cwd: "/tmp", mode: "read-only", timeoutMs: 1_000 },
    {
      runtime,
      status: "failed",
      text: "",
      usage: {},
      error: { category, message: category, retryable: true },
      process: { exitCode: 1, signal: null, durationMs: 1, timedOut: false, aborted: false, truncated: false },
    },
  ];
}

test("CLI dry-run accepts a prompt without executing an Agent", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    cli,
    "run",
    "--runtime",
    "pi",
    "--prompt",
    "test",
    "--read-only",
    "--dry-run",
  ], testOptions);
  assert.match(stdout, /Dry run: no Agent process was started/);
});

test("CLI requires an explicit dry-run or execute choice", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [
      cli,
      "run",
      "--runtime",
      "pi",
      "--prompt",
      "test",
      "--read-only",
    ], testOptions),
    /Use exactly one of --dry-run or --execute/,
  );
});

test("CLI refuses live Kimi execution before spawning it", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [
      cli,
      "run",
      "--runtime",
      "kimi",
      "--prompt",
      "test",
      "--read-only",
      "--execute",
      "--json",
    ], testOptions),
    (error: unknown) => {
      const output = (error as { stdout?: string }).stdout ?? "";
      return /unsafe-execution/.test(output);
    },
  );
});

test("CLI run --runtime auto skips a rate-limited runtime and picks the next by priority", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "fabric-cli-ledger-"));
  const ledgerPath = path.join(dir, "fabric.db");
  const ledger = UsageLedger.open(ledgerPath);
  try {
    const [request, result] = failedRun("codex", "rate-limited");
    ledger.record(request, result, new Date(), new Date());
  } finally {
    ledger.close();
  }
  const { stdout } = await execFileAsync(process.execPath, [
    cli, "run", "--runtime", "auto", "--priority", "codex,claude,pi",
    "--prompt", "test", "--read-only", "--dry-run", "--json",
  ], { env: { ...testOptions.env, PI_AGENT_FABRIC_LEDGER_PATH: ledgerPath } });
  const route = JSON.parse(stdout.split("\n")[0] ?? "{}");
  assert.equal(route.type, "route.selected");
  assert.equal(route.runtime, "claude");
  const codex = route.candidates.find((c: { runtime: string }) => c.runtime === "codex");
  assert.equal(codex.eligible, false);
  assert.match(stdout, /"runtime": "claude"/);
});

test("CLI auto routing never selects Kimi even when prioritized", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    cli, "run", "--runtime", "auto", "--priority", "kimi,grok",
    "--prompt", "test", "--read-only", "--dry-run", "--json",
  ], testOptions);
  const route = JSON.parse(stdout.split("\n")[0] ?? "{}");
  assert.equal(route.runtime, "grok");
});

test("CLI quota shows derived state from the ledger", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "fabric-cli-ledger-"));
  const ledgerPath = path.join(dir, "fabric.db");
  const ledger = UsageLedger.open(ledgerPath);
  try {
    const [request, result] = failedRun("pi", "quota-exhausted");
    ledger.record(request, result, new Date(), new Date());
  } finally {
    ledger.close();
  }
  const { stdout } = await execFileAsync(process.execPath, [cli, "quota", "--json"], {
    env: { ...testOptions.env, PI_AGENT_FABRIC_LEDGER_PATH: ledgerPath },
  });
  const snapshots = JSON.parse(stdout) as Array<{ runtime: string; state: string; status: string }>;
  assert.equal(snapshots.find((s) => s.runtime === "pi")?.state, "limited");
  assert.equal(snapshots.find((s) => s.runtime === "pi")?.status, "exhausted");
  assert.equal(snapshots.find((s) => s.runtime === "claude")?.state, "unknown");
  assert.equal(snapshots.find((s) => s.runtime === "kimi")?.state, "unknown");
});
