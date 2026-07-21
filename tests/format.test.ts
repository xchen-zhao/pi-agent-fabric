import assert from "node:assert/strict";
import test from "node:test";
import { formatRuntimeTable } from "../src/core/format.js";
import type { RuntimeDiscovery } from "../src/core/types.js";

const runtime: RuntimeDiscovery = {
  id: "pi",
  displayName: "Pi",
  command: "pi",
  executable: "/tmp/pi",
  installed: true,
  version: "1.0.0",
  auth: "configured",
  quotaStatus: "unknown",
  quotaConfidence: "unknown",
  capabilities: {
    headless: true,
    structuredOutput: true,
    streamingOutput: true,
    resume: true,
    worktree: false,
    nativeQuotaQuery: false,
  },
  notes: [],
};

test("formatRuntimeTable renders core discovery fields", () => {
  const output = formatRuntimeTable([runtime]);
  assert.match(output, /Runtime/);
  assert.match(output, /Pi/);
  assert.match(output, /configured/);
  assert.match(output, /unknown/);
});
