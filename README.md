# yeetkit-omarchy

Omarchy shell plugins written as [yeetkit](https://github.com/yeet-src/yeetkit) apps. A SolidJS page
runs **inside a yeet isolate** on the machine and renders into the Quattro
bar — and the panel under it — over the isolate's own tty. There is no
QML to write, and no port: the shell receives patches on a pipe.

## Getting started

The repository is self-contained: the isolate runtime and build pipeline
are copied in from [yeetkit](https://github.com/yeet-src/yeetkit) (see
[UPSTREAM.md](UPSTREAM.md)), so one clone is enough.

```sh
git clone git@github.com:yeet-src/yeetkit-omarchy.git
cd yeetkit-omarchy && npm install
npm i -g --prefix ~/.local .        # puts `yeetkit-omarchy` on PATH, as a symlink
```

Then a plugin:

```sh
yeetkit-omarchy new procs --id io.github.you.procs
cd procs
npm install          # links the framework; ~1s, no download
npm run dev          # builds into ~/.config/omarchy/plugins/io.github.you.procs
omarchy plugin enable io.github.you.procs
```

Needs `node` (>= 20) and `yeet` on `PATH` with the daemon running. The
plugin itself needs only `yeet` and `script` from util-linux, which every
Arch install has. `yeetkit-omarchy check` also wants `qml6` from
`qt6-declarative`, which Omarchy machines already have; without it the QML
layer of the check is skipped and says so.

## The idea

An Omarchy plugin is QML loaded into the long-running shell process. A
yeetkit app is a Solid tree in an isolate whose every mutation leaves as
one patch on its tty. The browser client applies those patches to a DOM;
this package ships a second client that applies them to QML items.

```
  omarchy-shell (Quickshell)                       isolate
  ┌───────────────────────────────┐                ┌──────────────────────┐
  │ BarWidget.qml  Panel.qml      │                │ app/page.jsx         │
  │   └ yeetkit/Yeetkit.qml       │  stdout: frames│   <bar>…</bar>       │
  │       └ nodes/*.qml           │◀───────────────│   <panel>…</panel>   │
  │ yeetkit/Isolate.qml (singleton)│  stdin: keys  │                      │
  │   └ Process: script yeet run ─┼───────────────▶│ yeet.graph bpf ai    │
  └───────────────────────────────┘                └──────────────────────┘
```

`Isolate.qml` is a QML singleton — once per engine, and the shell is one
engine — so however many monitors show the widget there is one `yeet
run`, started when the first widget attaches and stopped a few seconds
after the last detaches. Every widget is a view of it, exactly as two
browser tabs are in yeetkit.

The transport is the process's stdio. An isolate has a tty — the one lane
with an input side — only when it is given a PTY, and a pipe is not one,
so the run is wrapped in `script`: the isolate sees a terminal, its
output arrives on stdout, and every byte written to stdin is a keystroke.
That is what the yeetkit wire format was built for: frames down inside an
OSC sequence escaped to pure ASCII, messages up as base64url ending in
Enter. There is no port, no socket, no Node hub, and nothing another user
on the machine can dial. Frames of a megabyte cross the PTY intact.

The page is ordinary yeetkit — `createSignal`, `<Index>`, `onCleanup`,
`yeet.graph`, `"use yeet"` modules, BPF objects from `bpf/` — and imports
from `"yeetkit"`, which the bundler resolves to the runtime vendored here.
Two elements are special:

```jsx
export default function Page() {
  const [count, setCount] = createSignal(0);
  /* … sample yeet.graph on a timer … */
  return (
    <>
      <bar tooltipText="Processes">{count()} procs</bar>
      <panel contentWidth={320} onOpen={() => start()} onClose={() => stop()}>
        <header>Top by memory</header>
        <Index each={top()}>{(p) => <row fill><text fill>{p().comm}</text><text tone="muted">{p().rss}</text></row>}</Index>
        <button onClick={sample}>Sample now</button>
      </panel>
    </>
  );
}
```

`<bar>` is the item in the bar. It becomes the shell's own `WidgetButton`,
so hover, tooltip, vertical bars and click registration are the host's.
`<panel>` is the popup: a `KeyboardPanel` anchored to the bar item, opened
by a left click, closed by Escape. Both can sit anywhere in the tree — a
layout may wrap them — and a page without `<panel>` is a widget that only
sends its clicks up.

## What crosses the wire

The renderer is unchanged: seven view ops (`mount insert remove text attr
listen unlisten`), each node `{id, tag, attrs, on, kids}` or `{id, text}`.
`false` travels as a value rather than a removal so `visible={false}` means
what it says. Attributes keep their JSX types, so `gap={8}` arrives as a
number and lands on an `int` property.

The QML client (`qml/Yeetkit.qml`) mirrors the tree by id. For each tag it
instantiates `nodes/<Tag>.qml`, whose contract is three conventions:

- plain properties named as the JSX attributes are — `setAttr` assigns
  them, coercing to the property's type, and a removed attribute restores
  the default it captured on first set
- a `slot` Item that children are reparented into, or `null` for a leaf
- an `ev(type, payload)` signal for what the user did; only types the
  isolate listens for go up

Text nodes have no item. A node's `text` property is the join of its text
children, which is how `<button>Save {n()}</button>` patches one segment.
QML has no `insertBefore`, so an insert re-appends the tail after the
anchor — linear in the tail, fine for a panel.

## The vocabulary

Every node borrows the shell's theme through `qs.Commons.Color` and
`qs.Commons.Style`, so a plugin follows the user's theme with no CSS.

| tag | QML | attributes | events |
|---|---|---|---|
| `bar` | `qs.Ui.WidgetButton` | `tooltipText active dimmed` | `onClick {button}` `onWheel {delta}` |
| `panel` | Column in a `KeyboardPanel` | `contentWidth gap open` | `onOpen` `onClose` |
| `column` `row` | Column / Row | `gap fill` | |
| `text` | Text | `tone size bold fill wrap align color` | |
| `icon` | Text, icon size | `tone` | |
| `header` | `PanelSectionHeader` | | |
| `separator` | `PanelSeparator` | | |
| `spacer` | Item | `size` | |
| `box` | Rectangle, bordered | `pad gap fill` | |
| `scroll` | Flickable | `maxHeight gap` | |
| `button` | `qs.Ui.Button` | `iconText selected active bordered tooltipText` | `onClick` `onContextMenu` |
| `toggle` | `qs.Ui.Toggle` | `label description checked` | `onChange {checked}` |
| `slider` | `qs.Ui.PanelSlider` | `value minimum maximum step integer` | `onInput onChange {value}` |
| `input` | `qs.Ui.TextField` | `value placeholder password` | `onInput onSubmit {value}` |
| `image` | Image | `src size` | |

`tone` is `fg | muted | accent | urgent | bar`; `size` is a `Style.font`
token: `caption bodySmall body subtitle title heading display displayLarge`.
`fill` on a text in a column takes the full width; in a row it takes what
the other children leave, so `<row fill><text fill>name</text><text>12
MiB</text></row>` is a two-column line with the label eliding first. Inputs
are controlled, as in yeetkit: the event says what the user asked for, the
attribute says what the app decided.

Keys the panel's `PanelKeyCatcher` sees — letters, arrows, Enter — are
forwarded as `key` messages, so yeetkit's `onKey(handler)` works while the
panel is open. Escape and Tab stay with the shell.

## What a plugin cannot do

- **`"use client"`** — there is no browser. The build fails and says so.
- **`"use server"`** — there is no Node hub. The build fails and says so.
  The isolate has `yeet.graph`, `yeet:bpf` and `yeet:ai`; for anything
  else, shell out from a `"use yeet"` function or edit the generated QML.
- **Streams from the shell** — a page consumes a `"use yeet"` generator
  directly in-process, which is the case that matters.
- **Kinds other than `bar-widget`** — `panel`, `overlay`, `menu` and `bar`
  need entry files this package does not generate yet. A bar widget with
  a nested panel is the shape of the official tutorial and of most
  first-party plugins.

## Commands

```
yeetkit-omarchy new <name> [--id io.github.you.name]
yeetkit-omarchy dev      build into ~/.config/omarchy/plugins/<id> and
                         rebuild on change (--out to redirect)
yeetkit-omarchy build    the publishable folder, in plugin/
yeetkit-omarchy check    drive a built plugin over a real portal
```

**dev** writes the plugin folder into the shell's plugin directory and
rebuilds on every change. The shell reloads plugin code on its own when
files there change, and `Isolate.qml` watches `app.js`: a rewritten bundle
restarts the run, and the widget's client reconnects and is handed a
fresh tree. The isolate's console output lands in the shell's log:
`qs log -p "$OMARCHY_PATH/shell"`.

**build** writes a self-contained, symlink-free folder: `manifest.json`
with `entryPoints` filled in, `BarWidget.qml` and `Panel.qml`, `app.js`,
`bin/app.bpf.o` if there is BPF, the `yeetkit/` runtime, and the project's
`README.md`, `LICENSE` and `preview.png`. Publish that folder as a git
repository; `omarchy plugin add <url> --enable` installs it.

**check** runs the isolate exactly as `Isolate.qml` does — under `script`
— and asserts four layers: the folder has what the shell looks for; Node,
speaking the QML client's protocol over the process's stdio, gets a
`mount` with a `<bar>`, no island, and a patch back for a click; when
`qml6` is installed, the client alone is unit-tested with a fake
transport, then the actual `Yeetkit.qml` and nodes run headless against
stubs of the shell's components in `test/stubs/`, reached over an HTTP
bridge because plain QtQuick has no Process; and finally the generated
`BarWidget.qml` and `Panel.qml` themselves are loaded with doubles of
`qs.Ui`, `qs.Commons` and `Quickshell.Io`, their Isolate singleton's stub
Process wired to the bridge, and the bar item, panel toggle and open
event are asserted end to end. `qmllint` from qt6-declarative is run over
the folder too when present; its dynamic-typing notes are reported, not
failed.

## Project layout

```
manifest.json         the Omarchy manifest; entryPoints are filled in
yeetkit.config.js     out, yeetArgs
app/page.jsx          the plugin
bpf/*.bpf.c           optional; Makefile and build/ come from yeetkit
plugin/               build output — the plugin folder
```

## Status

Verified here, on a machine without Omarchy: the build, the wire against a
real isolate over stdio under `script`, and the QML client, vocabulary and
generated entry files under `qml6` with doubles of the shell's components
and of Quickshell's Process. Not yet verified: all of it inside a running
Quattro shell, where the real `WidgetButton`, `KeyboardPanel` and layer
shell behave as themselves. The doubles in `test/stubs/` mirror the
properties the code uses from the real `shell/Ui` and `shell/Commons`;
where the real components differ, the nodes and entries are what to fix.
