import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import test from "node:test";

const execFileAsync = promisify(execFile);
const cli = path.resolve("dist", "src", "cli", "index.js");
const testOptions = {
  env: { ...process.env, PI_AGENT_FABRIC_LEDGER_PATH: ":memory:" },
};

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
