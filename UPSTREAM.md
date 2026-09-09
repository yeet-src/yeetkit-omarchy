# Vendored from yeetkit

yeetkit-omarchy has no dependency on the yeetkit package. The isolate
runtime and the build pipeline are copied from
[yeet-src/yeetkit](https://github.com/yeet-src/yeetkit) so a checkout
of this repository is complete on its own.

Copied verbatim at yeetkit commit `c45a416`:

| here | there |
|---|---|
| `src/runtime/*.js` | `src/runtime/*.js` — the isolate side: renderer, mount, router, protocol, rpc, streams, keys, probes |
| `src/cli/bundle.mjs` | `src/cli/bundle.mjs` — Babel for Solid's universal renderer, esbuild, the directive plugin |
| `src/cli/directives.mjs` | `src/cli/directives.mjs` |
| `src/cli/routes.mjs` | `src/cli/routes.mjs` |
| `src/cli/bpf.mjs` | `src/cli/bpf.mjs` |
| `src/cli/watch.mjs` | `src/cli/watch.mjs` |
| `templates/default/Makefile`, `build/`, `tsconfig.json` | `templates/default/…` — the BPF toolchain |

Application code still writes `import { createSignal } from "yeetkit"`:
the bundler resolves that name to `src/runtime/index.js` here, so a
page moves between the two frameworks unchanged.

To sync, copy the files again from a newer yeetkit and update the
commit above. Nothing in them is edited locally; anything this package
needs differently lives in `src/cli/build.mjs`, `dev.mjs`,
`check.mjs`, `config.mjs` and `qml/`.
