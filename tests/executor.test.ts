import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { AgentRuntimeAdapter } from "../src/adapters/runtime-adapter.js";
import { executeWithAdapter } from "../src/core/executor.js";
import type { ExecutionRequest, ProcessResult } from "../src/core/execution-types.js";
import type { RuntimeDefinition } from "../src/core/types.js";

const definition: RuntimeDefinition = {
  id: "pi",
  displayName: "Fixture Runtime",
  command: process.execPath,
  versionArgs: ["--version"],
  capabilities: {
    headless: true,
    structuredOutput: true,
    streamingOutput: true,
    resume: false,
    worktree: false,
    nativeQuotaQuery: false,
  },
  authMarkers: [],
  notes: [],
};

const request: ExecutionRequest = {
  runtime: "pi",
  prompt: "test",
  cwd: process.cwd(),
  mode: "read-only",
  timeoutMs: 2_000,
};

function fixtureAdapter(script: string, enforcement: "native" | "best-effort" = "native"): AgentRuntimeAdapter {
  return {
    id: "pi",
    definition,
    buildCommand: (executionRequest) => ({
      command: process.execPath,
      args: ["-e", script],
      displayArgs: ["-e", "<fixture>"],
      cwd: executionRequest.cwd,
      outputFormat: "jsonl",
      timeoutMs: 2_000,
      readOnlyEnforcement: enforcement,
      ...(enforcement === "best-effort" ? { safetyNote: "fixture is not isolated" } : {}),
    }),
    parseLine: (line) => {
      const value = JSON.parse(line) as { type: string; text?: string; input?: number };
      if (value.type === "text") return [{ type: "message.delta", text: value.text ?? "", timestamp: "fixture" }];
      if (value.type === "usage") return [{
        type: "usage.updated",
        ...(value.input === undefined ? {} : { inputTokens: value.input }),
        timestamp: "fixture",
      }];
      if (value.type === "done") return [{ type: "run.completed", timestamp: "fixture" }];
      return [];
    },
    classifyError: (result: ProcessResult) => result.spawnError
      ? { category: "spawn-failed", message: result.spawnError, retryable: false }
      : result.exitCode === 0
        ? undefined
        : { category: "unknown", message: "fixture failed", retryable: false },
  };
}

test("executor joins normalized events into an AgentResult", async () => {
  const script = [
    "console.log(JSON.stringify({type:'text',text:'O'}))",
    "console.log(JSON.stringify({type:'text',text:'K'}))",
    "console.log(JSON.stringify({type:'usage',input:12}))",
    "console.log(JSON.stringify({type:'done'}))",
  ].join(";");
  const events: string[] = [];
  const logDir = await mkdtemp(path.join(os.tmpdir(), "fabric-executor-"));
  const result = await executeWithAdapter(fixtureAdapter(script), request, {
    logDir,
    onEvent: (event) => events.push(event.type),
  });

  assert.equal(result.status, "completed");
  assert.equal(result.text, "OK");
  assert.equal(result.usage.inputTokens, 12);
  assert.deepEqual(events, ["run.started", "message.delta", "message.delta", "usage.updated", "run.completed"]);
});

test("executor rejects best-effort read-only runtimes before spawn", async () => {
  const result = await executeWithAdapter(fixtureAdapter("process.exit(99)", "best-effort"), request);
  assert.equal(result.status, "failed");
  assert.equal(result.error?.category, "unsafe-execution");
  assert.equal(result.process.durationMs, 0);
});

test("executor rejects successful but unrecognized output", async () => {
  const logDir = await mkdtemp(path.join(os.tmpdir(), "fabric-executor-"));
  const result = await executeWithAdapter(fixtureAdapter("console.log('{}')"), request, { logDir });
  assert.equal(result.status, "failed");
  assert.equal(result.error?.category, "invalid-output");
});

test("executor contains parser failures instead of crashing", async () => {
  const adapter = fixtureAdapter("console.log('not-json')");
  adapter.parseLine = () => {
    throw new Error("broken fixture parser");
  };
  const logDir = await mkdtemp(path.join(os.tmpdir(), "fabric-executor-"));
  const result = await executeWithAdapter(adapter, request, { logDir });
  assert.equal(result.status, "failed");
  assert.equal(result.error?.category, "invalid-output");
  assert.match(result.error?.message ?? "", /broken fixture parser/);
});

test("executor classifies process spawn failures", async () => {
  const logDir = await mkdtemp(path.join(os.tmpdir(), "fabric-executor-"));
  const result = await executeWithAdapter(fixtureAdapter("console.log('{}')"), {
    ...request,
    cwd: path.join(logDir, "missing-directory"),
  }, { logDir });
  assert.equal(result.status, "failed");
  assert.equal(result.error?.category, "spawn-failed");
});
