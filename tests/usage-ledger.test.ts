import assert from "node:assert/strict";
import { mkdtemp, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { AgentResult, ExecutionRequest } from "../src/core/execution-types.js";
import { UsageLedger } from "../src/usage/ledger.js";

const request: ExecutionRequest = {
  runtime: "codex",
  prompt: "this prompt must never be persisted",
  cwd: "/private/workspace",
  mode: "read-only",
  timeoutMs: 1_000,
};

const result: AgentResult = {
  runtime: "codex",
  status: "completed",
  text: "OK",
  usage: {
    inputTokens: 100,
    outputTokens: 5,
    cacheReadTokens: 20,
    cacheWriteTokens: 0,
    costUsd: 0.01,
  },
  process: {
    exitCode: 0,
    signal: null,
    durationMs: 250,
    timedOut: false,
    aborted: false,
    truncated: false,
  },
};

test("usage ledger records metadata without prompts or output text", () => {
  const ledger = UsageLedger.open(":memory:");
  try {
    const id = ledger.record(request, result, new Date("2026-01-01T00:00:00.000Z"), new Date("2026-01-01T00:00:01.000Z"));
    assert.ok(id);
    assert.deepEqual(ledger.summaries(), [{
      runtime: "codex",
      runs: 1,
      completed: 1,
      failed: 0,
      inputTokens: 100,
      outputTokens: 5,
      cacheReadTokens: 20,
      cacheWriteTokens: 0,
      costUsd: 0.01,
      lastRunAt: "2026-01-01T00:00:01.000Z",
    }]);
    const recent = ledger.recent(1);
    assert.equal(recent[0]?.status, "completed");
    assert.equal(JSON.stringify(recent).includes(request.prompt), false);
    assert.equal(JSON.stringify(recent).includes(result.text), false);
    assert.equal(JSON.stringify(recent).includes(request.cwd), false);
  } finally {
    ledger.close();
  }
});

test("usage ledger records failures and validates recent limits", () => {
  const ledger = UsageLedger.open(":memory:");
  try {
    ledger.record(request, {
      ...result,
      status: "failed",
      error: { category: "rate-limited", message: "limited", retryable: true },
    }, new Date(), new Date());
    assert.equal(ledger.summaries()[0]?.failed, 1);
    assert.equal(ledger.recent(1)[0]?.errorCategory, "rate-limited");
    assert.throws(() => ledger.recent(0), /between 1 and 1000/);
  } finally {
    ledger.close();
  }
});

test("usage ledger creates private database files", async () => {
  if (process.platform === "win32") return;
  const directory = await mkdtemp(path.join(os.tmpdir(), "fabric-ledger-"));
  const filePath = path.join(directory, "fabric.db");
  const ledger = UsageLedger.open(filePath);
  ledger.close();
  const mode = (await stat(filePath)).mode & 0o777;
  assert.equal(mode, 0o600);
});
