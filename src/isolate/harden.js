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
 * The wrappers run in the same realm as the code they guard against,
 * so they resolve nothing through a global or a prototype at call
 * time: a body that has replaced `String.prototype.replace`,
 * `Array.prototype.map`, `Function.prototype.apply` or
 * `JSON.stringify` by then has replaced what the wrappers would
 * otherwise call. Every built-in they need is taken into a module
 * binding as this file loads — before any application code runs —
 * and the text is walked by index with a bound `charCodeAt`, which a
 * later change to the prototype cannot reach.
 *
 * The tty global is sealed rather than removed because the host
 * dispatches key events through it: with it gone, `tty.on("keydown")`
 * never fires and the shell's hello never arrives (Try Omarchy VM,
 * 2026-10). The functions are exported on their own so they can be
 * tested under Node, where the real globals must stay.
 *
 * None of this is a sandbox. Code the application evaluates has the
 * application's reach — it can still reshape what the runtime itself
 * serialises, through a `toJSON` on a shared prototype, say. What it
 * loses here is the shell's ear; what the shell does with a frame it
 * cannot tell from the runtime's is bounded on the shell's side, where
 * a patch sets only the attributes a node lists and shows only what
 * `assetUrl` admits.
 */

/* The built-ins the wrappers use, taken now. A bound function keeps
 * the function it was made from: `charCodeAt(s, i)` still calls the
 * original after `String.prototype.charCodeAt` has been reassigned. */
const uncurry = Function.prototype.bind.bind(Function.prototype.call);
const apply = Reflect.apply;
const charCodeAt = uncurry(String.prototype.charCodeAt);
const stringify = JSON.stringify;
const text = String;
const ErrorType = Error;

/* The tty's event plumbing, left as it is: the host emits through it
 * and the runtime listens through it, and none of it writes bytes.
 * Everything else on the tty does (probed under yeet 2026-10: write,
 * title, clipboard, cursor and mode switches; `Worker`s have no tty and
 * their console does not reach the PTY). */
const TTY_EVENTS = ["on", "off", "once", "emit"];
const METHODS = ["log", "info", "debug", "warn", "error", "trace"];

/* ESC opens a frame and BEL closes one. Both become printable marks,
 * so a log line that carried them still reads, and still cannot be
 * parsed as a frame. Walked by index: a string's `length` and its
 * characters are its own, not its prototype's. */
export const defuse = (value) => {
  const s = typeof value === "string" ? value : text(value);
  let out = "";
  for (let i = 0; i < s.length; i += 1) {
    const code = charCodeAt(s, i);
    out += code === 0x1b ? "^[" : code === 0x07 ? "^G" : s[i];
  }
  return out;
};

/* One console argument as text. Objects go through JSON, which
 * escapes control characters on its own; an Error keeps its stack.
 * Whatever comes back is defused by the caller, so a `toString` or a
 * `toJSON` the value brings along can only choose the words. */
export const render = (value) => {
  if (typeof value === "string") return value;
  if (value === null || typeof value !== "object") return text(value);
  if (value instanceof ErrorType) return value.stack || `${value.name}: ${value.message}`;
  try {
    const json = stringify(value);
    return typeof json === "string" ? json : text(json);
  } catch {
    return text(value);
  }
};

/* The console arguments as one defused line. `args` is the wrapper's
 * own rest array, so its length and its slots are its own. */
const line = (args) => {
  let out = "";
  for (let i = 0; i < args.length; i += 1) out += (i > 0 ? " " : "") + render(args[i]);
  return defuse(out);
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
    const wrapped = (...args) => {
      for (let i = 0; i < args.length; i += 1) if (typeof args[i] === "string") args[i] = defuse(args[i]);
      return apply(original, tty, args);
    };
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
  const safe = {};
  for (const method of METHODS) {
    const sink = typeof original[method] === "function" ? original[method] : original.log;
    safe[method] = typeof sink === "function" ? (...args) => apply(sink, original, [line(args)]) : () => {};
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
