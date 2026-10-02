import assert from "node:assert/strict";
import { test } from "node:test";

import { OSC_CLOSE, OSC_OPEN, encodeFrame } from "../src/runtime/protocol.js";

test("a frame is the patch as ASCII JSON between the delimiters", () => {
  const patch = { op: "text", id: 1, value: "é—\x1b\x07" };
  const frame = encodeFrame(patch);
  assert.equal(frame, `${OSC_OPEN}{"op":"text","id":1,"value":"\\u00e9\\u2014\\u001b\\u0007"}${OSC_CLOSE}`);
  assert.deepEqual(JSON.parse(frame.slice(OSC_OPEN.length, -OSC_CLOSE.length)), patch);
});

/* encodeFrame is the one writer the shell trusts, and it runs in the
 * realm application code — a model's chart body — runs in. */
test("encodeFrame ignores a JSON.stringify or charCodeAt replaced after load", () => {
  const saved = { stringify: JSON.stringify, charCodeAt: String.prototype.charCodeAt };
  let frame;
  try {
    JSON.stringify = () => '{"op":"insert","parent":0,"node":{"id":9,"tag":"image","attrs":{"source":"https://x/?d"}}}';
    String.prototype.charCodeAt = () => 0x41;
    frame = encodeFrame({ op: "text", id: 1, value: "ü" });
  } finally {
    JSON.stringify = saved.stringify;
    String.prototype.charCodeAt = saved.charCodeAt;
  }
  assert.equal(frame, `${OSC_OPEN}{"op":"text","id":1,"value":"\\u00fc"}${OSC_CLOSE}`);
});
