import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { cleanupStaleTempDirs } from "../src/core/execution-supervisor.js";

test("stale prompt temp dirs are removed, fresh and unrelated ones are kept", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "fabric-cleanup-root-"));
  const stale = path.join(root, "pi-agent-fabric-stale");
  const fresh = path.join(root, "pi-agent-fabric-fresh");
  const other = path.join(root, "unrelated-old");
  const staleFile = path.join(root, "pi-agent-fabric-file");
  for (const dir of [stale, fresh, other]) mkdirSync(dir);
  writeFileSync(path.join(stale, "prompt.md"), "secret prompt");
  writeFileSync(staleFile, "not a dir");
  const old = new Date(Date.now() - 48 * 60 * 60_000);
  for (const target of [stale, other, staleFile]) utimesSync(target, old, old);

  const removed = await cleanupStaleTempDirs(24 * 60 * 60_000, root);
  assert.equal(removed, 1);
  assert.equal(existsSync(stale), false);
  assert.equal(existsSync(fresh), true);
  assert.equal(existsSync(other), true);
  assert.equal(existsSync(staleFile), true);
});

test("missing temp root is not an error", async () => {
  assert.equal(await cleanupStaleTempDirs(1, path.join(os.tmpdir(), "does-not-exist-fabric")), 0);
});
