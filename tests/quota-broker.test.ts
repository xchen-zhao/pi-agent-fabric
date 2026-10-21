import assert from "node:assert/strict";
import test from "node:test";
import type { RuntimeDiscovery, RuntimeId } from "../src/core/types.js";
import { deriveQuotaSnapshot } from "../src/quota/broker.js";
import { parsePriority, selectRuntime } from "../src/quota/router.js";
import type { QuotaSignalRun } from "../src/usage/ledger.js";

const now = new Date("2026-01-01T12:00:00.000Z");

function runtime(id: RuntimeId, installed = true): RuntimeDiscovery {
  return {
    id,
    displayName: id,
    command: id,
    installed,
    auth: "unknown",
    quotaStatus: "unknown",
    quotaConfidence: "unknown",
    capabilities: { headless: true, structuredOutput: true, streamingOutput: true, resume: false, worktree: false, nativeQuotaQuery: false },
    notes: [],
  };
}

function minutesAgo(minutes: number): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

function run(id: RuntimeId, minutes: number, extra: Partial<QuotaSignalRun> = {}): QuotaSignalRun {
  return { runtime: id, status: extra.errorCategory ? "failed" : "completed", finishedAt: minutesAgo(minutes), ...extra };
}

test("no runs means unknown", () => {
  const snapshot = deriveQuotaSnapshot(runtime("codex"), [], { now });
  assert.equal(snapshot.state, "unknown");
  assert.equal(snapshot.status, "unknown");
});

test("not installed is unknown even with old runs", () => {
  assert.equal(deriveQuotaSnapshot(runtime("codex", false), [run("codex", 1)], { now }).state, "unknown");
});

test("recent success is available (inferred)", () => {
  const snapshot = deriveQuotaSnapshot(runtime("codex"), [run("codex", 5)], { now });
  assert.equal(snapshot.state, "available");
  assert.equal(snapshot.confidence, "inferred");
});

test("rate limit inside default 15 minute cooldown is limited", () => {
  const snapshot = deriveQuotaSnapshot(runtime("codex"), [run("codex", 5, { errorCategory: "rate-limited" })], { now });
  assert.equal(snapshot.state, "limited");
  assert.equal(snapshot.status, "cooldown");
  assert.equal(snapshot.cooldownUntil, new Date(now.getTime() + 10 * 60_000).toISOString());
});

test("rate limit after cooldown expires is unknown, not available", () => {
  const snapshot = deriveQuotaSnapshot(runtime("codex"), [run("codex", 20, { errorCategory: "rate-limited" })], { now });
  assert.equal(snapshot.state, "unknown");
});

test("retry-after from the runtime overrides the default cooldown", () => {
  const signals = [run("codex", 5, { errorCategory: "rate-limited", retryAfterMs: 2 * 60_000 })];
  assert.equal(deriveQuotaSnapshot(runtime("codex"), signals, { now }).state, "unknown");
  const longer = [run("codex", 5, { errorCategory: "rate-limited", retryAfterMs: 30 * 60_000 })];
  assert.equal(deriveQuotaSnapshot(runtime("codex"), longer, { now }).state, "limited");
});

test("configurable cooldown windows", () => {
  const signals = [run("codex", 5, { errorCategory: "rate-limited" })];
  assert.equal(deriveQuotaSnapshot(runtime("codex"), signals, { now, rateLimitCooldownMs: 60_000 }).state, "unknown");
  const exhausted = [run("claude", 90, { errorCategory: "quota-exhausted" })];
  assert.equal(deriveQuotaSnapshot(runtime("claude"), exhausted, { now }).state, "unknown");
  assert.equal(deriveQuotaSnapshot(runtime("claude"), exhausted, { now, quotaCooldownMs: 120 * 60_000 }).state, "limited");
});

test("reported reset time wins and is marked reported", () => {
  const resetAt = new Date(now.getTime() + 3 * 60 * 60_000).toISOString();
  const snapshot = deriveQuotaSnapshot(runtime("claude"), [run("claude", 1, { errorCategory: "quota-exhausted", quotaResetAt: resetAt })], { now });
  assert.equal(snapshot.state, "limited");
  assert.equal(snapshot.status, "exhausted");
  assert.equal(snapshot.confidence, "reported");
  assert.equal(snapshot.cooldownUntil, resetAt);
});

test("a later success clears an earlier limit", () => {
  const signals = [run("codex", 10, { errorCategory: "rate-limited" }), run("codex", 2)];
  assert.equal(deriveQuotaSnapshot(runtime("codex"), signals, { now }).state, "available");
});

test("authentication failure is limited and unrelated failures are unknown", () => {
  const auth = deriveQuotaSnapshot(runtime("grok"), [run("grok", 1, { errorCategory: "authentication" })], { now });
  assert.equal(auth.state, "limited");
  assert.equal(auth.status, "unauthorized");
  assert.equal(deriveQuotaSnapshot(runtime("grok"), [run("grok", 1, { errorCategory: "timeout" })], { now }).state, "unknown");
});

test("reported quota status from events counts as a signal", () => {
  const signals = [{ runtime: "pi" as const, status: "completed" as const, finishedAt: minutesAgo(1), quotaStatus: "exhausted" }];
  assert.equal(deriveQuotaSnapshot(runtime("pi"), signals, { now }).state, "limited");
});

test("signals from other runtimes are ignored", () => {
  assert.equal(deriveQuotaSnapshot(runtime("pi"), [run("codex", 1, { errorCategory: "rate-limited" })], { now }).state, "unknown");
});

test("router prefers available, then unknown, skipping limited, missing and Kimi", () => {
  const runtimes = [runtime("pi"), runtime("claude"), runtime("codex"), runtime("grok", false), runtime("kimi")];
  const signals = [run("claude", 1, { errorCategory: "rate-limited" }), run("codex", 3)];
  const snapshots = runtimes.map((r) => deriveQuotaSnapshot(r, signals, { now }));
  const decision = selectRuntime(runtimes, snapshots, ["kimi", "grok", "claude", "pi", "codex"]);
  assert.equal(decision.selected, "codex");
  assert.deepEqual(decision.candidates.filter((c) => c.eligible).map((c) => c.runtime), ["pi", "codex"]);

  const noAvailable = selectRuntime(runtimes, snapshots, ["claude", "pi"]);
  assert.equal(noAvailable.selected, "pi");
});

test("router reports why nothing is eligible", () => {
  const runtimes = [runtime("kimi"), runtime("codex", false)];
  const decision = selectRuntime(runtimes, runtimes.map((r) => deriveQuotaSnapshot(r, [], { now })), ["kimi", "codex"]);
  assert.equal(decision.selected, undefined);
  assert.match(decision.reason, /kimi=excluded/);
  assert.match(decision.reason, /codex=not installed/);
});

test("priority parsing validates ids and removes duplicates", () => {
  assert.deepEqual(parsePriority("codex, claude,codex"), ["codex", "claude"]);
  assert.deepEqual(parsePriority(undefined), ["pi", "claude", "codex", "grok"]);
  assert.deepEqual(parsePriority(""), ["pi", "claude", "codex", "grok"]);
  assert.throws(() => parsePriority("codex,gpt"), /Invalid runtime in priority: gpt/);
});
