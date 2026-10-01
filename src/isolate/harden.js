/* What the isolate may no longer write raw, once the runtime is up.
 *
 * The shell trusts every frame on the isolate's tty: an OSC sequence
 * carrying JSON is a patch, whoever wrote it. The runtime writes
 * frames through `tty.write`, and everything else the isolate prints
 * — `console.log` included — lands on the same PTY. So any code
 * evaluated in the isolate after this point could forge a patch,
 * unless the raw writers are gone and what remains cannot carry a
 * frame's delimiters.
 *
 * `boot.js` runs `harden()` first thing in the generated entry, once
 * the runtime has loaded and `mount.js` holds the tty's raw writer in
 * its own binding. Then the tty is sealed — every method that takes
 * text is wrapped so ESC and BEL cannot pass, and the object frozen —
 * and the console is replaced by one that prints text in which they
 * cannot occur either. Logging still works, and still lands in the
 * shell's log; the tty still moves the cursor and sets the title. What
 * neither can do any more is open or close a frame.
 *
 * The tty global is sealed rather than removed because the host
 * dispatches key events through it: with it gone, `tty.on("keydown")`
 * never fires and the shell's hello never arrives (Try Omarchy VM,
 * 2026-10). The functions are exported on their own so they can be
 * tested under Node, where the real globals must stay.
 *
 * None of this is a sandbox. Code the application evaluates has the
 * application's reach; what it loses here is the shell's ear.
 */

/* The tty's event plumbing, left as it is: the host emits through it
 * and the runtime listens through it, and none of it writes bytes.
 * Everything else on the tty does (probed under yeet 2026-10: write,
 * title, clipboard, cursor and mode switches; `Worker`s have no tty and
 * their console does not reach the PTY). */
const TTY_EVENTS = ["on", "off", "once", "emit"];
const METHODS = ["log", "info", "debug", "warn", "error", "trace"];

/* ESC opens a frame and BEL closes one. Both become printable marks,
 * so a log line that carried them still reads, and still cannot be
 * parsed as a frame. */
export const defuse = (text) => String(text).replace(/\x1b/g, "^[").replace(/\x07/g, "^G");

/* One console argument as text. Objects go through JSON, which
 * escapes control characters on its own; an Error keeps its stack. */
export const render = (value) => {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
  if (value === null || typeof value !== "object") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

/* Wraps every method of the tty that is not event plumbing so that any
 * string it is handed is defused first, pins each in place and freezes
 * the object. The originals survive only inside the closures. Returns
 * false if a method could not be replaced. */
export function sealTty(tty) {
  if (typeof tty !== "object" || tty === null) return true;
  let sealed = true;
  for (const name of Object.getOwnPropertyNames(tty)) {
    const original = tty[name];
    if (typeof original !== "function" || TTY_EVENTS.includes(name)) continue;
    const wrapped = (...args) => original.apply(tty, args.map((arg) => (typeof arg === "string" ? defuse(arg) : arg)));
    try {
      Object.defineProperty(tty, name, { value: wrapped, writable: false, configurable: false, enumerable: true });
    } catch {
      sealed = false;
    }
    if (tty[name] !== wrapped) sealed = false;
  }
  try {
    Object.freeze(tty);
  } catch {
    sealed = false;
  }
  return sealed && Object.isFrozen(tty);
}

/* Replaces the console's methods with ones that print defused text
 * through the originals, and seals the object so nothing can put a
 * raw method back. The originals survive only inside the closures. */
export function sanitizeConsole(original) {
  const line = (args) => defuse(args.map(render).join(" "));
  const safe = {};
  for (const method of METHODS) {
    const sink = typeof original[method] === "function" ? original[method] : original.log;
    safe[method] = typeof sink === "function" ? (...args) => sink.call(original, line(args)) : () => {};
  }
  for (const key of Object.keys(original)) {
    if (!(key in safe)) safe[key] = () => {};
  }
  return Object.freeze(safe);
}

export function harden(target = globalThis) {
  const kept = [];
  if ("tty" in target) {
    if (!sealTty(target.tty)) kept.push("tty");
    try {
      Object.defineProperty(target, "tty", { value: target.tty, writable: false, configurable: false, enumerable: true });
    } catch {
      /* the object is sealed either way; this only stops a swap */
    }
  }
  if (typeof target.console === "object" && target.console !== null) {
    const safe = sanitizeConsole(target.console);
    try {
      Object.defineProperty(target, "console", { value: safe, writable: false, configurable: false, enumerable: false });
    } catch {
      try {
        target.console = safe;
      } catch {
        kept.push("console");
      }
    }
    if (target.console !== safe) kept.push("console");
  }
  if (kept.length > 0) {
    const warn = target.console?.warn ?? (() => {});
    warn(`yeetkit: could not seal ${kept.join(", ")}; frames written through it would be trusted by the shell`);
  }
  return kept;
}
