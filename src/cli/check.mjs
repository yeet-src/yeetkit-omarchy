#!/usr/bin/env node
/* End-to-end check of a built plugin: a real isolate, a real portal,
 * the protocol the shell speaks.
 *
 *   node src/cli/check.mjs <plugin-dir>
 *
 * The isolate is run exactly as the plugin's Isolate.qml runs it —
 * `yeet run` under `script`, so it has a PTY — and driven over that
 * process's stdio. Three layers, each asserting what the one below
 * cannot:
 *
 *   folder    the files the shell will look for are there, no symlinks
 *   wire      Node plays the QML client — base64url lines up, OSC
 *             frames down — and asserts the tree has a <bar>, no
 *             islands, and answers a click
 *   qml       if `qml6` is installed, the actual client and node
 *             vocabulary are loaded under it, headless, against stubs
 *             of the shell's components, and driven over an HTTP bridge
 *             to the same isolate
 */

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, lstat, readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(process.argv[2] ?? "plugin");

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const OSC_OPEN = "\x1b]7880;";
const OSC_CLOSE = "\x07";

const encode = (message) => {
  const bytes = new TextEncoder().encode(JSON.stringify(message));
  let out = "";
  let bits = 0;
  let width = 0;
  for (const byte of bytes) {
    bits = (bits << 8) | byte;
    width += 8;
    while (width >= 6) {
      width -= 6;
      out += B64[(bits >> width) & 0x3f];
    }
  }
  if (width > 0) out += B64[(bits << (6 - width)) & 0x3f];
  return `${out}\n`;
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const exists = (path) => access(path).then(() => true, () => false);

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail && !ok ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};
const skip = (label, why) => console.log(`  skip  ${label} — ${why}`);

function flatten(node, into = []) {
  if (!node) return into;
  into.push(node);
  for (const kid of node.kids ?? []) flatten(kid, into);
  return into;
}
const textOf = (node) => flatten(node).map((n) => n.text ?? "").join("");

// ---- folder ---------------------------------------------------------

console.log("folder");
const manifest = JSON.parse(await readFile(join(dist, "manifest.json"), "utf8").catch(() => "null"));
check("manifest.json parses", manifest !== null);
if (manifest) {
  check("kinds include bar-widget", manifest.kinds?.includes("bar-widget"));
  for (const [key, file] of Object.entries(manifest.entryPoints ?? {})) {
    check(`entryPoints.${key} → ${file} exists`, await exists(join(dist, file)));
  }
  check("id is not omarchy.*", !String(manifest.id).startsWith("omarchy."));
}
for (const file of ["app.js", "yeetkit/qmldir", "yeetkit/Yeetkit.qml", "yeetkit/Isolate.qml", "yeetkit/StdioTransport.qml", "yeetkit/Protocol.js", "yeetkit/Config.js", "yeetkit/nodes/Bar.qml", "yeetkit/nodes/Panel.qml"]) {
  check(`${file} present`, await exists(join(dist, file)));
}
{
  const links = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if ((await lstat(path)).isSymbolicLink()) links.push(path);
      else if (entry.isDirectory()) await walk(path);
    }
  };
  await walk(dist);
  check("no symlinks anywhere in the folder", links.length === 0, links.join(", "));
}
const configJs = await readFile(join(dist, "yeetkit/Config.js"), "utf8").catch(() => "");
check("Config.js names the plugin", manifest ? configJs.includes(JSON.stringify(manifest.id)) : false);
/* The same quoting the QML will do, evaluated here: a path with a quote
 * in it must still be one argument to yeet. */
{
  const quote = new Function(`${configJs.replace(".pragma library", "")}; return quote;`)();
  check("Config.js quotes a path for sh", quote("/a b/it's.js") === "'/a b/it'\\''s.js'", quote("/a b/it's.js"));
}

// ---- the isolate ----------------------------------------------------

const frames = [];
const feed = framer((frame) => frames.push(...unbatch(frame)));

/* As Isolate.qml runs it: under `script`, so the isolate has a PTY and
 * therefore a tty, with our pipe on the far side of it. */
const quoted = (word) => `'${String(word).replace(/'/g, "'\\''")}'`;
const isolate = spawn("script", ["-qfec", ["yeet", "run", "-y", "-q", join(dist, "app.js")].map(quoted).join(" "), "/dev/null"], {
  cwd: dist,
  stdio: ["pipe", "pipe", "pipe"],
});
isolate.on("error", (error) => {
  console.error(`could not run script (util-linux): ${error.message}`);
  process.exit(1);
});
let isolateUp = true;
isolate.on("exit", () => (isolateUp = false));
let raw = "";
const chunks = [];
isolate.stdout.on("data", (data) => {
  const text = data.toString("latin1");
  raw += text;
  chunks.push(text);
  feed(text);
});
isolate.stderr.on("data", (c) => process.stderr.write(`isolate: ${c}`));
const send = (message) => isolate.stdin.write(encode(message));
await wait(2500);

function framer(onFrame) {
  let pending = "";
  return (chunk) => {
    pending += chunk;
    for (;;) {
      const start = pending.indexOf(OSC_OPEN);
      if (start < 0) return;
      const end = pending.indexOf(OSC_CLOSE, start);
      if (end < 0) return;
      const body = pending.slice(start + OSC_OPEN.length, end);
      pending = pending.slice(end + OSC_CLOSE.length);
      try {
        onFrame(JSON.parse(body));
      } catch {
        /* a partial frame */
      }
    }
  };
}
function unbatch(frame, into = []) {
  if (frame.op === "batch") for (const one of frame.patches) unbatch(one, into);
  else into.push(frame);
  return into;
}

console.log("\nwire");
check("the isolate is running under script", isolateUp, raw.slice(0, 200));
if (!isolateUp) finish();

const since = () => frames.length;
const framesAfter = (mark) => frames.slice(mark);
const until = async (predicate, ms = 3000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await wait(50);
  }
  return predicate();
};

/* The client repeats hello until the mount arrives, for the same reason:
 * a line typed before the isolate's key listener is up may be lost. */
send({ t: "hello", path: "/" });
await until(() => frames.some((f) => f.op === "mount"), 1500) || (send({ t: "hello", path: "/" }), await until(() => frames.some((f) => f.op === "mount")));
const mount = frames.find((f) => f.op === "mount");
check("hello is answered with a mount", Boolean(mount));

let bar = null;
let panel = null;
if (mount) {
  const all = flatten(mount.root);
  bar = all.find((n) => n.tag === "bar");
  panel = all.find((n) => n.tag === "panel");
  check("the tree has a <bar>", Boolean(bar));
  if (bar) check("the bar has a label", textOf(bar).trim().length > 0, JSON.stringify(textOf(bar)));
  check("no island reached the tree", !all.some((n) => n.tag === "yeet-island"));
  if (panel) check("the <panel> has content", (panel.kids ?? []).length > 0);
  else skip("panel", "the app has none");

  const clickable = all.find((n) => n.on?.includes("click") && n.tag !== "bar") ?? all.find((n) => n.on?.includes("click"));
  if (clickable) {
    const mark = since();
    send({ t: "event", id: clickable.id, type: "click", payload: { button: 0 } });
    const answered = await until(() => framesAfter(mark).length > 0, 2500);
    check(`a click on <${clickable.tag}> produces a patch`, answered);
  } else skip("click", "nothing listens for one");

  if (panel && panel.on?.includes("open")) {
    const mark = since();
    send({ t: "event", id: panel.id, type: "open", payload: {} });
    const answered = await until(() => framesAfter(mark).length > 0, 2500);
    check("opening the panel produces a patch", answered);
  }
}

// ---- qml ------------------------------------------------------------

console.log("\nqml");
const qml6 = await new Promise((resolve) => {
  /* Only whether the binary is there: `error` fires when it is not. */
  const probe = spawn("qml6", ["--help"], { stdio: "ignore" });
  probe.on("error", () => resolve(false));
  probe.on("exit", () => resolve(true));
});

if (!qml6) {
  skip("the client under qml6", "qml6 is not installed (qt6-declarative)");
} else {
  /* First the client alone, driven by a fake transport: the tree
   * mechanics that need no isolate. Each line is one assertion. */
  {
    const unit = spawn("qml6", ["-I", join(here, "..", "..", "test", "stubs"), join(here, "..", "..", "test", "unit.qml"), "--", dist], {
      env: { ...process.env, QT_QPA_PLATFORM: "offscreen", QT_FORCE_STDERR_LOGGING: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let text = "";
    unit.stdout.on("data", (c) => (text += c));
    unit.stderr.on("data", (c) => (text += c));
    const timer = setTimeout(() => unit.kill("SIGKILL"), 15000);
    const code = await new Promise((r) => unit.on("exit", (c) => r(c)));
    clearTimeout(timer);
    const lines = text.split("\n").map((l) => l.replace(/^qml: /, ""));
    const results = lines.filter((l) => l.startsWith("UNIT ")).map((l) => JSON.parse(l.slice(5)));
    check("the client unit test ran", code === 0 && results.some((r) => r.done), lines.filter((l) => l.trim() && !l.startsWith("UNIT ")).slice(0, 4).join(" | "));
    for (const r of results.filter((r) => r.label)) check(r.label, r.ok, r.detail ?? "");
    const other = lines.filter((l) => !l.startsWith("UNIT ") && !/diskcache/.test(l) && /Error|error|Warning|non-existent|TypeError|ReferenceError|yeetkit:/.test(l));
    check("no QML warnings in the unit test", other.length === 0, other.slice(0, 4).join(" | "));
  }

  /* The bridge: the isolate's stdio as an HTTP lane, holding output
   * chunks until the harness polls for them and forwarding what it
   * posts to stdin. Plain QtQuick has no Process and no WebSocket. */
  const lane = { frames: chunks, get open() { return isolateUp; } };
  const bridged = new Map([["tty", lane]]);

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://x");
    const [, name, verb] = url.pathname.split("/");
    const lane = bridged.get(name);
    if (!lane) {
      response.writeHead(404).end();
      return;
    }
    if (verb === "down") {
      const from = Number(url.searchParams.get("since") ?? 0);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ open: lane.open, frames: lane.frames.slice(from), next: lane.frames.length }));
      return;
    }
    if (verb === "up") {
      let body = "";
      for await (const chunk of request) body += chunk;
      isolate.stdin.write(Buffer.from(body, "latin1"));
      response.end("ok");
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const http = `http://127.0.0.1:${server.address().port}`;

  const args = ["-I", join(here, "..", "..", "test", "stubs"), join(here, "..", "..", "test", "harness.qml"), "--", dist, `${http}/tty`];
  const run = spawn("qml6", args, {
    env: { ...process.env, QT_QPA_PLATFORM: "offscreen", QT_FORCE_STDERR_LOGGING: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const events = [];
  const noise = [];
  const onLine = (line) => {
    const m = /HARNESS (.*)$/.exec(line);
    if (m) {
      try {
        events.push(JSON.parse(m[1]));
      } catch {
        noise.push(line);
      }
    } else if (line.trim()) noise.push(line.replace(/^qml: /, ""));
  };
  for (const stream of [run.stdout, run.stderr]) {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop();
      lines.forEach(onLine);
    });
  }
  const timer = setTimeout(() => run.kill("SIGKILL"), 15000);
  const code = await new Promise((r) => run.on("exit", (c) => r(c)));
  clearTimeout(timer);
  server.close();

  if (process.argv.includes("--verbose")) {
    for (const e of events) console.log(`  harness  ${JSON.stringify(e)}`);
    for (const l of noise) console.log(`  qml      ${l}`);
  }
  const find = (name) => events.find((e) => e.event === name);
  check("the harness ran", code === 0 && Boolean(find("done")), `exit ${code}; ${events.map((e) => e.event).join(",") || noise.slice(0, 3).join(" | ")}`);
  const error = find("error");
  if (error) check(`${error.where} loaded`, false, error.message);
  const stdio = find("stdio");
  check("StdioTransport and the Isolate singleton load", Boolean(stdio), "no report");
  if (stdio) check("Isolate would run yeet under script", /^script -qfec 'yeet' 'run' .*app\.js' \/dev\/null$/.test(stdio.command), stdio.command);
  const live = find("live");
  check("the client reached live", Boolean(live), find("timeout") ? "timed out" : "");
  if (live) {
    const s = live.summary;
    check("<bar> became a WidgetButton with the label", Boolean(s.bar) && s.bar.text.trim().length > 0, JSON.stringify(s.bar));
    if (s.bar) check("the bar item has a size", s.bar.implicitWidth > 0);
    if (panel) {
      check("<panel> became a Panel with children", Boolean(s.panel) && s.panel.kids.length > 0, JSON.stringify(s.panel));
      if (s.panel) {
        check("panel children are visible and sized", s.panel.kids.every((k) => k.visible && k.height > 0), JSON.stringify(s.panel.kids));
        check("the panel has a height", s.panel.implicitHeight > 0);
      }
    }
    check("event listeners were recorded", s.listened > 0);
    const clicked = find("clicked");
    if (clicked && !find("no-button")) check("a click through the node reached the isolate and came back", clicked.patches > 0);
    const toggled = find("toggled");
    if (toggled) check("a controlled <toggle> followed the app's state", toggled.after === !toggled.before, JSON.stringify(toggled));
  }
  const qmlWarnings = noise.filter((l) => !/diskcache/.test(l) && /yeetkit:|Error|error|Warning|non-existent|TypeError|ReferenceError/.test(l));
  check("no QML warnings", qmlWarnings.length === 0, qmlWarnings.slice(0, 5).join(" | "));
}

finish();

function finish() {
  isolate.kill("SIGTERM");
  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check${failures === 1 ? "" : "s"} failed`);
  setTimeout(() => process.exit(failures === 0 ? 0 : 1), 200);
}
