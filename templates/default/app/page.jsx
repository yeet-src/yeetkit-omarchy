import { Index, createSignal, onCleanup } from "yeetkit";

/* The whole plugin is one page. Two elements in it are special: <bar>
 * is what sits in the bar, and <panel> is what opens under it. Both
 * run here, in the isolate, next to the data they show — there is no
 * QML to write, and the shell only ever receives patches. */

const mib = (bytes) => `${Math.round(bytes / 1048576)} MiB`;

export default function Page() {
  const [count, setCount] = createSignal(0);
  const [top, setTop] = createSignal([]);
  const [showMore, setShowMore] = createSignal(false);
  const [open, setOpen] = createSignal(false);

  const sample = async () => {
    const { data } = await yeet.graph.query(`{ procs { pid stat { comm rss_bytes } } }`);
    setCount(data.procs.length);
    const sorted = [...data.procs].sort((a, b) => b.stat.rss_bytes - a.stat.rss_bytes);
    setTop(sorted.slice(0, showMore() ? 16 : 8));
  };

  sample();
  const timer = setInterval(sample, 2000);
  onCleanup(() => clearInterval(timer));

  return (
    <>
      <bar tooltipText="Processes — click for the top consumers">{count()} procs</bar>

      <panel contentWidth={320} onOpen={() => setOpen(true)} onClose={() => setOpen(false)}>
        <header>Top by memory</header>
        {/* <Index> keys by position and hands down an accessor, so a
            fresh sample patches the cells that moved rather than
            rebuilding every row. */}
        <Index each={top()}>
          {(proc) => (
            <row fill gap={8}>
              <text fill>{proc().stat.comm}</text>
              <text tone="muted">{mib(proc().stat.rss_bytes)}</text>
            </row>
          )}
        </Index>
        <separator />
        <toggle
          label="Show sixteen"
          description="Eight rows by default"
          checked={showMore()}
          onChange={(e) => {
            setShowMore(e.checked);
            sample();
          }}
        />
        <row gap={8}>
          <button onClick={sample}>Sample now</button>
          <text tone="muted" size="caption">
            {open() ? "live · every 2s" : ""}
          </text>
        </row>
      </panel>
    </>
  );
}
