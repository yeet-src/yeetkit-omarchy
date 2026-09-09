/* The dev loop: the plugin folder is written straight into the shell's
 * plugin directory and rebuilt on every change.
 *
 * Omarchy reloads plugin code whenever a file under
 * ~/.config/omarchy/plugins/ changes, so a rebuilt QML entry shows up
 * on its own. The isolate belongs to the plugin's Isolate singleton,
 * which watches app.js and restarts the run when the bundle is
 * rewritten; the widget's client reconnects, says hello, and is handed
 * a fresh tree — one restart per save and nothing to reload.
 */

import { spawn } from "node:child_process";
import { join } from "node:path";

import { sources, watchLoop } from "yeetkit/src/cli/watch.mjs";

import { QML, buildIsolate, writePlugin } from "./build.mjs";
import { loadConfig } from "./config.mjs";

const POLL_MS = 300;

const color = process.env.NO_COLOR === undefined && (process.env.FORCE_COLOR !== undefined || process.stdout.isTTY);
const paint = (code, text) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
const dim = (text) => paint("2", text);

const TAGS = {
  kit: paint("36", "omarchy "),
  build: paint("32", "build   "),
  changed: paint("33", "changed "),
  shell: paint("34", "shell   "),
  error: paint("31", "error   "),
};

const log = (tag, message) => console.log(`${TAGS[tag]} ${dim("|")} ${message}`);

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

  const rebuild = async ({ first = false } = {}) => {
    try {
      const built = await buildIsolate(config, { dev: true });
      const written = await writePlugin(config, target);
      if (first) {
        log("build", `app.js (routes ${built.summary ?? "/"}) ${dim(`→ ${target}`)}`);
        if (built.bpf) log("build", dim("bpf ok"));
        log("build", `${written.entries.join(", ")} ${dim("+ yeetkit/")}`);
      } else {
        log("build", `app.js ${dim("— the shell restarts the isolate")}`);
      }
      return true;
    } catch (error) {
      log("error", error.message);
      return false;
    }
  };

  log("kit", config.manifest.id);
  const ok = await rebuild({ first: true });
  if (!ok) log("kit", "fix the error above; the watcher is running");

  if (await rescan()) log("shell", "plugins rescanned");
  else log("shell", dim("omarchy-shell not reachable — the shell picks the folder up when it is running"));
  log("shell", dim(`enable with: omarchy plugin enable ${config.manifest.id}`));
  log("shell", dim(`the isolate's log: qs log -p "$OMARCHY_PATH/shell" | grep ${config.manifest.id}`));

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
}
