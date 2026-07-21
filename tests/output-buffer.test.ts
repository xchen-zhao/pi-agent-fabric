import assert from "node:assert/strict";
import test from "node:test";
import { BoundedOutputBuffer } from "../src/core/output-buffer.js";
import { redactSecrets } from "../src/core/redaction.js";

test("bounded output keeps the tail and marks truncation", () => {
  const buffer = new BoundedOutputBuffer({ maxBytes: 20, maxLines: 2 });
  buffer.append("first\nsecond\nthird\n");
  assert.equal(buffer.truncated, true);
  assert.match(buffer.content, /Earlier output truncated/);
  assert.match(buffer.content, /third/);
  assert.doesNotMatch(buffer.content, /first/);
});

test("redactor masks common credential forms", () => {
  const output = redactSecrets("authorization: Bearer abcdefghijklmnop api_key=secret-value");
  assert.doesNotMatch(output, /abcdefghijklmnop/);
  assert.doesNotMatch(output, /secret-value/);
  assert.match(output, /REDACTED/);
});
