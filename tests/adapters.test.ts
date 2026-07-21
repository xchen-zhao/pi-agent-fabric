import assert from "node:assert/strict";
import test from "node:test";
import { getRuntimeAdapter, listRuntimeAdapters } from "../src/adapters/registry.js";
import type { ExecutionRequest } from "../src/core/execution-types.js";

const baseRequest: ExecutionRequest = {
  runtime: "pi",
  prompt: "private prompt",
  cwd: "/tmp/project",
  mode: "read-only",
  timeoutMs: 60_000,
};

test("registry contains all supported runtimes", () => {
  assert.deepEqual(
    listRuntimeAdapters().map((adapter) => adapter.id),
    ["pi", "claude", "codex", "grok", "kimi"],
  );
});

test("all adapters build read-only, non-shell command specs", () => {
  for (const adapter of listRuntimeAdapters()) {
    const spec = adapter.buildCommand({ ...baseRequest, runtime: adapter.id });
    assert.equal(spec.cwd, baseRequest.cwd);
    assert.equal(spec.timeoutMs, baseRequest.timeoutMs);
    assert.equal(spec.outputFormat, "jsonl");
    assert.ok(spec.args.length > 0);
  }
});

test("Kimi declares best-effort read-only enforcement", () => {
  const spec = getRuntimeAdapter("kimi").buildCommand({ ...baseRequest, runtime: "kimi" });
  assert.equal(spec.readOnlyEnforcement, "best-effort");
  assert.match(spec.safetyNote ?? "", /ACP|sandbox/);
});

test("Kimi dry-run display does not expose its argument-delivered prompt", () => {
  const spec = getRuntimeAdapter("kimi").buildCommand({ ...baseRequest, runtime: "kimi" });
  assert.equal(spec.args.includes(baseRequest.prompt), true);
  assert.equal(spec.displayArgs.includes(baseRequest.prompt), false);
  assert.match(spec.displayArgs.at(-1) ?? "", /^<prompt:\d+ bytes>$/);
});

test("Grok delivers prompts through a temporary file", () => {
  const spec = getRuntimeAdapter("grok").buildCommand({ ...baseRequest, runtime: "grok" });
  assert.equal(spec.args.includes(baseRequest.prompt), false);
  assert.equal(spec.displayArgs.at(-1), "<prompt-file>");
  assert.equal(spec.temporaryFiles?.[0]?.content, baseRequest.prompt);
});

test("stdin-capable adapters keep prompt out of process arguments", () => {
  for (const id of ["pi", "claude", "codex"] as const) {
    const spec = getRuntimeAdapter(id).buildCommand({ ...baseRequest, runtime: id });
    assert.equal(spec.args.includes(baseRequest.prompt), false);
    assert.equal(spec.stdin, baseRequest.prompt);
  }
});
