/* The dev loop: the plugin folder is written straight into the shell's
 * plugin directory, and the isolate runs here rather than under
 * Service.qml.
 *
 * Omarchy reloads plugin code whenever a file under
 * ~/.config/omarchy/plugins/ changes, so a rebuilt QML entry shows up
 * on its own. The isolate is ours to restart: its portal drops, the
 * widget's socket reconnects, says hello, and is handed a fresh tree —
 * one reconnect per save and no reload.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { sources, watchLoop } from "yeetkit/src/cli/watch.mjs";

import { QML, buildIsolate, writePlugin } from "./build.mjs";
import { loadConfig } from "./config.mjs";

const POLL_MS = 300;
const RESPAWN_GRACE_MS = 900;
const STARTUP_GRACE_MS = 2500;
const START_RETRIES = 4;

const color = process.env.NO_COLOR === undefined && (process.env.FORCE_COLOR !== undefined || process.stdout.isTTY);
const paint = (code, text) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
const dim = (text) => paint("2", text);

const TAGS = {
  kit: paint("36", "omarchy "),
  build: paint("32", "build   "),
  changed: paint("33", "changed "),
  restart: paint("35", "restart "),
  shell: paint("34", "shell   "),
  isolate: paint("2;37", "isolate "),
  error: paint("31", "error   "),
};

const log = (tag, message) => console.log(`${TAGS[tag]} ${dim("|")} ${message}`);

const digest = async (file) => createHash("sha1").update(await readFile(file)).digest("hex");

function rescan() {
  return new Promise((resolve) => {
    const child = spawn("omarchy-shell", ["shell", "rescanPlugins"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

export async function dev(initial, argv) {
  let config = initial;
  const at = argv.indexOf("--out");
  const target = at >= 0 ? argv[at + 1] : config.install;

  let child = null;
  let restarting = false;
  let starts = 0;
  let appHash = null;

  const lanes = () => {
    const out = ["-p", `tty:ws://127.0.0.1:${config.wsPort}`];
    if (config.direct) out.push("-p", `console:ws://127.0.0.1:${config.consolePort}`);
    return out;
  };

  const start = () => {
    starts += 1;
    const startedAt = Date.now();
    child = spawn("yeet", ["run", "-y", "-q", ...lanes(), join(target, "app.js")], {
      cwd: target,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const relay = (stream) =>
      stream.on("data", (chunk) => {
        for (const line of String(chunk).split("\n").filter(Boolean)) log("isolate", dim(line));
      });
    relay(child.stdout);
    relay(child.stderr);

    const spawned = child;
    child.on("error", (error) => log("error", `could not run yeet: ${error.message}`));
    child.on("exit", (code) => {
      if (spawned !== child || restarting) return;
      if (Date.now() - startedAt < STARTUP_GRACE_MS && starts <= START_RETRIES) {
        log("restart", `isolate exited ${code} during startup — retrying`);
        setTimeout(start, RESPAWN_GRACE_MS);
      } else if (code !== 0 && code !== null) {
        log("error", `isolate exited ${code}; waiting for a change`);
      }
    });
  };

  const restart = () => {
    restarting = true;
    const old = child;
    if (old) {
      old.once("exit", () => {
        setTimeout(() => {
          restarting = false;
          starts = 0;
          start();
        }, RESPAWN_GRACE_MS);
      });
      old.kill("SIGTERM");
    } else {
      restarting = false;
      start();
    }
  };

  const rebuild = async ({ first = false } = {}) => {
    try {
      const built = await buildIsolate(config, { dev: true });
      const next = await digest(join(config.out, "app.js"));
      const written = await writePlugin(config, target, { managed: false });
      if (first) {
        log("build", `app.js (routes ${built.summary ?? "/"}) ${dim(`→ ${target}`)}`);
        if (built.bpf) log("build", dim("bpf ok"));
        log("build", `${written.entries.join(", ")} ${dim("+ yeetkit/")}`);
      } else {
        log("build", built.summary ?? "ok");
      }
      if (next !== appHash) {
        appHash = next;
        if (first) start();
        else {
          log("restart", "isolate");
          restart();
        }
      }
      return true;
    } catch (error) {
      log("error", error.message);
      return false;
    }
  };

  log("kit", `${config.manifest.id} ${dim(`ws ${config.wsPort}${config.direct ? ` console ${config.consolePort}` : ""}`)}`);
  const ok = await rebuild({ first: true });
  if (!ok) log("kit", "fix the error above; the watcher is running");

  if (await rescan()) log("shell", "plugins rescanned");
  else log("shell", dim("omarchy-shell not reachable — the shell picks the folder up when it is running"));
  log("shell", dim(`enable with: omarchy plugin enable ${config.manifest.id}`));

  const list = () =>
    sources([config.appDir, join(config.root, "bpf"), QML], join(config.root, "manifest.json"), join(config.root, "yeetkit.config.js"));

  watchLoop({
    list,
    interval: POLL_MS,
    onChange: async (changed) => {
      for (const file of changed) log("changed", dim(file));
      if (changed.some((file) => file.endsWith("manifest.json") || file.endsWith("yeetkit.config.js"))) {
        try {
          config = await loadConfig(config.root, argv);
        } catch (error) {
          log("error", error.message);
          return;
        }
      }
      await rebuild();
    },
  });

  const stop = () => {
    restarting = true;
    child?.kill("SIGTERM");
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
