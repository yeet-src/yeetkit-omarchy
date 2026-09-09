# __NAME__

An Omarchy bar widget built with [yeetkit-omarchy](https://github.com/yeet-src/yeetkit-omarchy):
the plugin's UI is a SolidJS page that runs inside a yeet isolate on this
machine and renders into the bar over a local WebSocket.

## Requirements

- [yeet](https://yeet.cx) — `yeet` on `PATH` with the daemon running
- `qt6-websockets` — the QML WebSocket module Omarchy does not ship:
  `sudo pacman -S qt6-websockets`

## Install

```sh
omarchy plugin add <this repository's url> --enable
```

The plugin starts one isolate (`yeet run` on `app.js`, tty bound to
`ws://127.0.0.1:3401`) and the bar widget connects to it. Nothing else is
installed or run.

## Remove

```sh
omarchy plugin remove __ID__
```
