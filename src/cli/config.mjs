/* What a plugin project is made of.
 *
 *   app/                 the yeetkit app — pages, layouts, "use yeet" modules
 *   manifest.json        the Omarchy manifest, as the shell will read it;
 *                        `entryPoints` is filled in by the build
 *   yeetkit.config.js    optional: title, out, yeetArgs
 *   bpf/                 optional, compiled by the build as in yeetkit
 *
 * The build's output is a complete plugin folder — the thing `omarchy
 * plugin add` clones and the shell loads. It has to be self-contained
 * and symlink-free, so the QML runtime is copied into it rather than
 * referenced, and the isolate bundle sits beside it as `app.js`. The
 * plugin's own QML runs the isolate over its stdio; there is no port.
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const KINDS = {
  "bar-widget": { entryPoint: "barWidget", file: "BarWidget.qml" },
  panel: { entryPoint: "panel", file: "Panel.qml" },
  overlay: { entryPoint: "overlay", file: "Overlay.qml" },
  menu: { entryPoint: "menu", file: "Menu.qml" },
  service: { entryPoint: "service", file: "Service.qml" },
  bar: { entryPoint: "bar", file: "Bar.qml" },
};

/* The kinds this runtime can render. A bar widget carries its own
 * panel, as the first-party clock does; standalone `panel`, `overlay`,
 * `menu` and whole-bar `bar` plugins need entry files not written yet. */
export const RENDERABLE = ["bar-widget"];

export const pluginsDir = () => join(homedir(), ".config", "omarchy", "plugins");

export async function loadConfig(root, argv = []) {
  const flag = (name, fallback) => {
    const at = argv.indexOf(`--${name}`);
    return at >= 0 ? argv[at + 1] : fallback;
  };

  let loaded = {};
  try {
    loaded = (await import(`file://${join(root, "yeetkit.config.js")}`)).default ?? {};
  } catch (error) {
    if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
  }

  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`no manifest.json in ${root} — is this a yeetkit-omarchy project?`);
    throw new Error(`manifest.json: ${error.message}`);
  }
  validateManifest(manifest);

  const yeetArgs = Array.isArray(loaded.yeetArgs) ? loaded.yeetArgs.map(String) : [];

  return {
    root,
    appDir: join(root, "app"),
    out: join(root, ".yeetkit"),
    /* Where `build` writes the plugin. `dev` writes straight into the
     * shell's plugin directory instead, so a save shows up in the bar. */
    dist: resolve(root, flag("out", loaded.out ?? "plugin")),
    install: join(pluginsDir(), manifest.id),
    title: loaded.title ?? manifest.name,
    /* Extra arguments for `yeet run`, e.g. ["--heap-limit", "1GiB"]. */
    yeetArgs,
    manifest,
    kinds: manifest.kinds.filter((kind) => RENDERABLE.includes(kind)),
  };
}

function validateManifest(manifest) {
  const problems = [];
  if (manifest.schemaVersion !== 1) problems.push("schemaVersion must be 1");
  for (const key of ["id", "name", "version", "description", "license"]) {
    if (typeof manifest[key] !== "string" || manifest[key] === "") problems.push(`${key} is required`);
  }
  if (typeof manifest.id === "string") {
    if (manifest.id.startsWith("omarchy.")) problems.push("id cannot use the omarchy.* namespace");
    if (!/^[a-z0-9][a-z0-9._-]*\.[a-z0-9._-]+$/i.test(manifest.id)) problems.push("id should be namespaced, like io.github.you.thing");
  }
  if (!Array.isArray(manifest.kinds) || manifest.kinds.length === 0) {
    problems.push("kinds must be a non-empty array");
  } else {
    for (const kind of manifest.kinds) {
      if (!(kind in KINDS)) problems.push(`unknown kind "${kind}"`);
      else if (!RENDERABLE.includes(kind)) problems.push(`kind "${kind}" is not supported by yeetkit-omarchy yet — only bar-widget is`);
    }
  }
  if (manifest.kinds?.includes("bar-widget") && manifest.barWidget?.defaultSection !== undefined) {
    if (!["left", "center", "right"].includes(manifest.barWidget.defaultSection)) {
      problems.push("barWidget.defaultSection must be left, center or right");
    }
  }
  if (problems.length) throw new Error(`manifest.json:\n  ${problems.join("\n  ")}`);
}
