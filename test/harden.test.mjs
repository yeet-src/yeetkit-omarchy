import assert from "node:assert/strict";
import { test } from "node:test";

import { defuse, harden, render, sanitizeConsole, sealTty } from "../src/isolate/harden.js";

const FRAME = "\x1b]7880;" + JSON.stringify({ op: "insert", parent: 0, node: { id: 9, tag: "image", attrs: { src: "https://x/?d" } } }) + "\x07";
const OPEN = /\x1b\]7880;/;

/* A stand-in for yeet's tty: own methods, event plumbing, a writer. */
const listeners = [];
const fakeTty = (written) => ({
  write: function (s) { written.push(["write", this === tty, s]); },
  title: function (s) { written.push(["title", this === tty, s]); },
  move: function (x, y) { written.push(["move", this === tty, x, y]); },
  on: (type, fn) => listeners.push({ type, fn }),
  off() {},
  once() {},
  emit() {},
  size: { cols: 80, rows: 24 },
});
let tty;

test("defused text cannot open or close a frame", () => {
  const out = defuse(FRAME);
  assert.doesNotMatch(out, OPEN);
  assert.doesNotMatch(out, /\x07/);
  assert.match(out, /\^\[\]7880;.*\^G$/);
});

test("render keeps strings, serialises objects, keeps an error's stack", () => {
  assert.equal(render("a"), "a");
  assert.equal(render(3), "3");
  assert.equal(render(null), "null");
  assert.equal(render({ a: "\x1b" }), '{"a":"\\u001b"}');
  assert.match(render(new Error("boom")), /^Error: boom\n/);
});

test("a sanitized console prints through the original and carries no delimiters", () => {
  const lines = [];
  const original = { log: (...a) => lines.push(["log", ...a]), warn: (...a) => lines.push(["warn", ...a]), table: () => lines.push(["table"]) };
  const safe = sanitizeConsole(original);
  safe.log("hello", FRAME, { k: FRAME });
  safe.warn(FRAME);
  safe.error("no error method on the original");
  safe.table("silenced");
  assert.equal(lines.length, 3);
  for (const [, text] of lines) {
    assert.equal(typeof text, "string");
    assert.doesNotMatch(text, OPEN);
    assert.doesNotMatch(text, /[\x1b\x07]/);
  }
  assert.equal(lines[2][0], "log", "a missing method falls back to log");
  assert.ok(Object.isFrozen(safe));
  assert.throws(() => {
    "use strict";
    safe.log = () => {};
  });
});

test("a sealed tty defuses every string it is handed and keeps its events", () => {
  const written = [];
  tty = fakeTty(written);
  const rawWrite = tty.write.bind(tty);
  assert.equal(sealTty(tty), true);
  assert.ok(Object.isFrozen(tty));

  tty.write(FRAME);
  tty.title("t" + FRAME);
  tty.move(3, "4\x1b");
  for (const [, boundToTty, ...args] of written) {
    assert.equal(boundToTty, true, "the original runs with the tty as this");
    for (const arg of args) if (typeof arg === "string") assert.doesNotMatch(arg, /[\x1b\x07]/);
  }
  assert.equal(written[2][2], 3, "a number passes through untouched");

  rawWrite(FRAME);
  assert.match(written[3][2], OPEN, "the writer taken before sealing still writes raw");

  const fn = () => {};
  tty.on("keydown", fn);
  assert.deepEqual(listeners, [{ type: "keydown", fn }], "event plumbing is untouched");
  assert.throws(() => {
    "use strict";
    tty.write = rawWrite;
  });
});

test("harden on a stand-in global leaves no raw writer and no raw console", () => {
  const written = [];
  tty = fakeTty(written);
  const target = { tty, console: { log: (s) => written.push(["console", true, s]) } };
  const kept = harden(target);
  assert.deepEqual(kept, []);
  assert.equal(target.tty, tty, "the tty global stays: the host dispatches events through it");
  assert.equal(Object.getOwnPropertyDescriptor(target, "tty").writable, false);
  target.tty.write(FRAME);
  target.console.log(FRAME);
  assert.equal(written.length, 2);
  for (const [, , text] of written) assert.doesNotMatch(text, OPEN);
  assert.ok(Object.isFrozen(target.console));
  assert.equal(Object.getOwnPropertyDescriptor(target, "console").writable, false);
});
