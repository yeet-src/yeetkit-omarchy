# __NAME__

An Omarchy bar widget built with [yeetkit-omarchy](https://github.com/yeet-src/yeetkit-omarchy):
the plugin's UI is a SolidJS page that runs inside a yeet isolate on this
machine and renders into the bar over a local WebSocket.

## Requirements

- [yeet](https://yeet.cx) — `yeet` on `PATH` with the daemon running

## Install

```sh
omarchy plugin add <this repository's url> --enable
```

The plugin runs one isolate — `yeet run app.js` under `script`, so it has a
terminal — and talks to it over that process's stdin and stdout. No port
is opened and nothing else is installed or run; the isolate stops a few
seconds after the last bar widget goes away.

## Remove

```sh
omarchy plugin remove __ID__
```
