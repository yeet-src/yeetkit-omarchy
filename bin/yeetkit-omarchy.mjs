#!/usr/bin/env node
/* yeetkit-omarchy — Omarchy shell plugins written as yeetkit apps.
 *
 *   yeetkit-omarchy new <name> [--id io.github.you.name]
 *                              a plugin project to start from
 *   yeetkit-omarchy dev        build into ~/.config/omarchy/plugins/<id>,
 *                              rebuild on change
 *   yeetkit-omarchy build      the plugin folder, in plugin/
 *   yeetkit-omarchy check      drive a built plugin over a real portal
 */

import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const command = argv[0] ?? "dev";

const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 ? argv[at + 1] : fallback;
};

const root = resolve(flag("dir", process.cwd()));

const fail = (error) => {
  console.error(`error: ${error.message}`);
  process.exit(1);
};

switch (command) {
  case "dev": {
    const { loadConfig } = await import("../src/cli/config.mjs");
    const { dev } = await import("../src/cli/dev.mjs");
    const config = await loadConfig(root, argv).catch(fail);
    await dev(config, argv);
    break;
  }

  case "build": {
    const { loadConfig } = await import("../src/cli/config.mjs");
    const { build } = await import("../src/cli/build.mjs");
    const config = await loadConfig(root, argv).catch(fail);
    try {
      const result = await build(config);
      console.log(`app.js (routes ${result.summary ?? "/"}) → ${config.dist}`);
      if (result.bpfSize) console.log(`bpf — bin/app.bpf.o ${(result.bpfSize / 1024).toFixed(1)}kb`);
      console.log(`${result.entries.join(", ")} + yeetkit/ + manifest.json`);
      console.log(`\npublish that folder as a git repo, then:\n  omarchy plugin add <repo-url> --enable`);
    } catch (error) {
      fail(error);
    }
    break;
  }

  case "check": {
    const { loadConfig } = await import("../src/cli/config.mjs");
    const config = await loadConfig(root, argv).catch(fail);
    const script = join(here, "..", "src", "cli", "check.mjs");
    const args = [script, config.dist, ...argv.slice(1).filter((a) => a.startsWith("--") && a !== "--dir")];
    const code = await new Promise((done) => {
      spawn(process.execPath, args, { stdio: "inherit" }).on("exit", (c) => done(c ?? 1));
    });
    process.exit(code);
  }

  case "new": {
    const name = argv[1];
    if (!name || name.startsWith("--")) {
      console.error("usage: yeetkit-omarchy new <name> [--id io.github.you.name]");
      process.exit(1);
    }
    const target = resolve(root, name);
    const id = flag("id", `local.${name.replace(/[^a-z0-9._-]/gi, "-").toLowerCase()}`);
    await mkdir(target, { recursive: true });
    await cp(join(here, "..", "templates", "default"), target, { recursive: true });

    /* The BPF build lives in yeetkit's template and is copied from
     * there, so `bpf/*.bpf.c` works the moment it exists. */
    const yeetkitTemplate = join(dirname(await resolveYeetkit()), "templates", "default");
    for (const file of ["Makefile", "build", "tsconfig.json"]) {
      await cp(join(yeetkitTemplate, file), join(target, file), { recursive: true }).catch(() => {});
    }

    const fill = async (file) => {
      const path = join(target, file);
      const text = await readFile(path, "utf8");
      await writeFile(path, text.replaceAll("__ID__", id).replaceAll("__NAME__", name));
    };
    await fill("manifest.json");
    await fill("README.md");

    /* See yeetkit's `new`: from a checkout the dependency is a `file:`
     * path so the project's own PATH has the CLI; from a registry it
     * is the version. */
    const framework = resolve(here, "..");
    const installed = framework.split(sep).includes("node_modules");
    const { version } = JSON.parse(await readFile(join(framework, "package.json"), "utf8"));
    await writeFile(
      join(target, "package.json"),
      `${JSON.stringify(
        {
          name,
          private: true,
          type: "module",
          scripts: {
            dev: "yeetkit-omarchy dev",
            build: "yeetkit-omarchy build",
            check: "yeetkit-omarchy build && yeetkit-omarchy check",
          },
          dependencies: { "yeetkit-omarchy": installed ? `^${version}` : `file:${framework}` },
        },
        null,
        2,
      )}\n`,
    );

    console.log(`created ${target}  (${id})\n\n  cd ${name}\n  npm install\n  npm run dev\n`);
    break;
  }

  default:
    console.error(`unknown command "${command}"; try dev, build, check or new`);
    process.exit(1);
}

async function resolveYeetkit() {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  /* The exports map hides package.json, so go through a file it does
   * expose and walk up to the package root. */
  const entry = require.resolve("yeetkit/src/cli/bpf.mjs");
  return join(dirname(entry), "..", "..", "package.json");
}
