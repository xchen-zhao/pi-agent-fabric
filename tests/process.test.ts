import assert from "node:assert/strict";
import test from "node:test";
import { findExecutable, runCommand } from "../src/core/process.js";

test("findExecutable locates node in PATH", async () => {
  const executable = await findExecutable("node");
  assert.ok(executable);
});

test("runCommand captures stdout", async () => {
  const result = await runCommand(process.execPath, ["-e", "process.stdout.write('ok')"]);
  assert.equal(result.code, 0);
  assert.equal(result.stdout, "ok");
  assert.equal(result.timedOut, false);
});
