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

/* The wrappers share a realm with the code they guard against. A chart
 * body that has replaced the built-ins the wrappers would otherwise
 * call by the time it logs must find that nothing changed. */
test("the wrappers ignore built-ins replaced after harden", () => {
  const written = [];
  tty = fakeTty(written);
  const target = { tty, console: { log: (s) => written.push(["console", true, s]) } };
  assert.deepEqual(harden(target), []);

  const saved = {
    replace: String.prototype.replace,
    charCodeAt: String.prototype.charCodeAt,
    symbolReplace: RegExp.prototype[Symbol.replace],
    map: Array.prototype.map,
    join: Array.prototype.join,
    apply: Function.prototype.apply,
    call: Function.prototype.call,
    stringify: JSON.stringify,
    reflectApply: Reflect.apply,
  };
  try {
    String.prototype.replace = function () { return String(this); };
    RegExp.prototype[Symbol.replace] = (s) => s;
    String.prototype.charCodeAt = () => 0x41;
    Array.prototype.map = function () { return this; };
    Array.prototype.join = function () { return FRAME; };
    Function.prototype.apply = function () {};
    Function.prototype.call = function () {};
    JSON.stringify = () => FRAME;
    Reflect.apply = () => {};
    target.tty.write(FRAME);
    target.tty.title("t" + FRAME);
    target.console.log(FRAME, { k: FRAME }, 7);
  } finally {
    String.prototype.replace = saved.replace;
    String.prototype.charCodeAt = saved.charCodeAt;
    RegExp.prototype[Symbol.replace] = saved.symbolReplace;
    Array.prototype.map = saved.map;
    Array.prototype.join = saved.join;
    Function.prototype.apply = saved.apply;
    Function.prototype.call = saved.call;
    JSON.stringify = saved.stringify;
    Reflect.apply = saved.reflectApply;
  }

  assert.equal(written.length, 3, "every call still reached its original");
  for (const [, boundToTty, text] of written) {
    assert.equal(boundToTty, true);
    assert.equal(typeof text, "string");
    assert.doesNotMatch(text, OPEN);
    assert.doesNotMatch(text, /[\x1b\x07]/);
  }
  assert.match(written[0][2], /^\^\[\]7880;.*\^G$/, "the tty write was defused, not dropped");
  assert.match(written[2][2], /^\^\[\]7880;.*\^G \{"k":"\\u001b\]7880;.*"\} 7$/, "the log line was rendered and defused");
});

test("defuse and render take values that are not strings", () => {
  assert.equal(defuse(7), "7");
  assert.equal(defuse(Symbol("s\x1b")), "Symbol(s^[)");
  assert.equal(render(Symbol("s")), "Symbol(s)");
  assert.equal(render(() => 1), "() => 1");
  assert.equal(render({ toJSON() { throw new Error("no"); }, toString: () => "fallback" }), "fallback");
});
