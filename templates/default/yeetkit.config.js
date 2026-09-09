export default {
  /* The isolate's tty portal: loopback only, dialled by the bar widget
   * and its panel. Pick a port no other plugin on the machine uses. */
  ws: 3401,
  /* Direct mode puts the view on the console lane, on `console:` (ws + 1
   * by default). The tty lane is a PTY and drops bytes on frames past
   * ~64 KiB; a panel that renders a lot at once wants this on. */
  // direct: true,
  // console: 3402,
  /* Where `build` writes the plugin folder. */
  out: "plugin",
};
