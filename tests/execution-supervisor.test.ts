import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { superviseExecution } from "../src/core/execution-supervisor.js";
import type { CommandSpec } from "../src/core/execution-types.js";

function nodeSpec(script: string, timeoutMs = 2_000): CommandSpec {
  return {
    command: process.execPath,
    args: ["-e", script],
    displayArgs: ["-e", "<script>"],
    cwd: process.cwd(),
    outputFormat: "text",
    timeoutMs,
    readOnlyEnforcement: "native",
  };
}

test("supervisor captures lines and writes a redacted audit log", async () => {
  const logDir = await mkdtemp(path.join(os.tmpdir(), "fabric-test-"));
  const lines: string[] = [];
  const result = await superviseExecution(nodeSpec("console.log('hello')"), {
    logDir,
    onStdoutLine: (line) => lines.push(line),
  });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(lines, ["hello"]);
  assert.ok(result.fullOutputPath);
  assert.match(await readFile(result.fullOutputPath, "utf8"), /hello/);
});

test("supervisor terminates timed out processes", async () => {
  const logDir = await mkdtemp(path.join(os.tmpdir(), "fabric-test-"));
  const result = await superviseExecution(nodeSpec("setTimeout(() => {}, 10000)", 30), { logDir });
  assert.equal(result.timedOut, true);
  assert.notEqual(result.exitCode, 0);
});
