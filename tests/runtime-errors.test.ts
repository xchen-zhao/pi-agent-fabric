import assert from "node:assert/strict";
import test from "node:test";
import { classifyCommonError } from "../src/adapters/runtime-adapter.js";
import type { ProcessResult } from "../src/core/execution-types.js";

function failed(stderr: string): ProcessResult {
  return {
    stdout: "",
    stderr,
    exitCode: 1,
    signal: null,
    timedOut: false,
    aborted: false,
    truncated: false,
    durationMs: 10,
  };
}

test("classifies authentication failures", () => {
  assert.equal(classifyCommonError(failed("401 Unauthorized: login required"))?.category, "authentication");
});

test("classifies rate limits and parses retry-after seconds", () => {
  const error = classifyCommonError(failed("429 Too Many Requests; Retry-After: 45"));
  assert.equal(error?.category, "rate-limited");
  assert.equal(error?.retryAfterMs, 45_000);
});

test("classifies exhausted billing quota separately from rate limits", () => {
  const error = classifyCommonError(failed("403 usage limit reached for this billing cycle"));
  assert.equal(error?.category, "quota-exhausted");
});

test("abort and timeout take precedence over textual errors", () => {
  assert.equal(classifyCommonError({ ...failed("401 Unauthorized"), aborted: true })?.category, "aborted");
  assert.equal(classifyCommonError({ ...failed("401 Unauthorized"), timedOut: true })?.category, "timeout");
});
