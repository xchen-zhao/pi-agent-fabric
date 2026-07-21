import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { getRuntimeAdapter } from "../src/adapters/registry.js";
import type { AgentEvent, ProcessResult } from "../src/core/execution-types.js";

async function parseFixture(runtime: "pi" | "claude" | "codex" | "grok"): Promise<AgentEvent[]> {
  const fixture = await readFile(path.resolve("tests", "fixtures", `${runtime}.jsonl`), "utf8");
  const adapter = getRuntimeAdapter(runtime);
  return fixture.trim().split("\n").flatMap((line) => adapter.parseLine(line));
}

for (const runtime of ["pi", "claude", "codex", "grok"] as const) {
  test(`${runtime} parser extracts text, usage, and completion`, async () => {
    const events = await parseFixture(runtime);
    assert.ok(events.some((event) => event.type === "message.delta" && event.text === "OK"));
    assert.ok(events.some((event) => event.type === "usage.updated"));
    assert.ok(events.some((event) => event.type === "run.completed"));
  });
}

test("Claude parser reports provider rate-limit state", async () => {
  const events = await parseFixture("claude");
  const quota = events.find((event) => event.type === "quota.updated");
  assert.ok(quota && quota.type === "quota.updated");
  assert.equal(quota.status, "available");
  assert.equal(quota.confidence, "reported");
  assert.equal(quota.resetAt, "2030-01-01T00:00:00.000Z");
});

test("Kimi usage-limit error is classified as quota exhaustion", async () => {
  const stderr = await readFile(path.resolve("tests", "fixtures", "kimi-quota-error.txt"), "utf8");
  const result: ProcessResult = {
    stdout: "",
    stderr,
    exitCode: 1,
    signal: null,
    timedOut: false,
    aborted: false,
    truncated: false,
    durationMs: 100,
  };
  const error = getRuntimeAdapter("kimi").classifyError(result);
  assert.equal(error?.category, "quota-exhausted");
  assert.equal(error?.retryable, true);
});
