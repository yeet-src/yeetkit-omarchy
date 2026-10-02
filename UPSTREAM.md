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
commit above. Anything this package needs differently lives in
`src/cli/build.mjs`, `dev.mjs`, `check.mjs`, `config.mjs`, `qml/` and
`src/isolate/`, with two exceptions to carry across a sync until they
are upstream: `src/runtime/mount.js` takes the tty's `write` and `on`
into a module binding at load instead of reading the global at each
write, so that `src/isolate/harden.js` can seal the global once the
runtime holds the raw writer; and `src/runtime/protocol.js` takes
`JSON.stringify` and `String.prototype.charCodeAt` into module bindings
for `encodeFrame`, so code evaluated later in the isolate cannot change
what the one trusted writer serialises by replacing them.
