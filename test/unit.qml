import QtQuick

/* The client alone, fed frames by a fake transport: no isolate, no
 * bridge, just the tree mechanics. Each `UNIT {json}` line is one
 * assertion for check.mjs to report.
 *
 *   qml6 -I test/stubs test/unit.qml -- <plugin-dir>
 */
Item {
  id: root

  property var client: null
  property var sent: []

  Component {
    id: fake
    QtObject {
      property bool live: true
      signal message(string text)
      signal opened()
      signal closed()
      function send(buffer) {
        var view = new Uint8Array(buffer)
        var text = ""
        for (var i = 0; i < view.length; i++) text += String.fromCharCode(view[i])
        root.sent.push(text)
        return true
      }
    }
  }

  function say(payload) { console.log("UNIT " + JSON.stringify(payload)) }
  function assert(label, ok, detail) { say({ label: label, ok: !!ok, detail: ok ? undefined : String(detail) }) }
  function frame(patch) { return "\x1b]7880;" + JSON.stringify(patch) + "\x07" }
  function feed(patch) { client.lane.message(frame(patch)) }

  Item { id: stage; width: 320; height: 600 }
  function host(name, item) { if (!item) return; item.parent = stage }

  function kidsText(item) {
    var out = []
    for (var i = 0; i < item.slot.children.length; i++) {
      var text = item.slot.children[i].text
      out.push(text === undefined ? "" : text)
    }
    return out
  }

  function tree() {
    return { op: "mount", title: "unit", root: { id: 0, tag: "#root", attrs: {}, kids: [
      { id: 1, tag: "bar", attrs: { tooltipText: "tip" }, on: ["click"], kids: [{ id: 2, text: "3 " }, { id: 3, text: "procs" }] },
      { id: 10, tag: "panel", attrs: { contentWidth: 300 }, on: ["open"], kids: [
        { id: 11, tag: "text", attrs: { tone: "muted" }, kids: [{ id: 12, text: "A" }] },
        { id: 13, tag: "text", attrs: {}, kids: [{ id: 14, text: "C" }] },
        { id: 15, tag: "button", attrs: { bordered: true }, on: ["click"], kids: [{ id: 16, text: "Save " }, { id: 17, text: "1" }] },
        { id: 18, tag: "column", attrs: { gap: 12, visible: false }, kids: [] }
      ] }
    ] } }
  }

  // Deferred destruction settles between steps, so the steps are timers.
  Timer { id: step1; interval: 50; onTriggered: root.run1() }
  Timer { id: step2; interval: 50; onTriggered: root.run2() }
  Timer { id: step3; interval: 50; onTriggered: root.run3() }

  function run1() {
    feed(tree())
    assert("a mount makes the client live", client.phase === "live", client.phase)
    assert("hello was sent on open", sent.length === 1 && sent[0].length > 0, sent.length)
    assert("regions are registered", client.regions.bar && client.regions.panel, Object.keys(client.regions))
    assert("bar text is the join of its segments", client.regions.bar.text === "3 procs", client.regions.bar.text)
    assert("an attribute lands on the node's property", client.regions.bar.tooltipText === "tip", client.regions.bar.tooltipText)
    assert("a number attribute stays a number", client.regions.panel.contentWidth === 300, client.regions.panel.contentWidth)
    assert("false travels as false", client.nodes[18].item.visible === false, client.nodes[18].item.visible)
    assert("panel kids in order", JSON.stringify(kidsText(client.regions.panel)) === '["A","C","Save 1",""]', JSON.stringify(kidsText(client.regions.panel)))

    // insert B before C
    feed({ op: "insert", parent: 10, before: 13, node: { id: 20, tag: "text", attrs: {}, kids: [{ id: 21, text: "B" }] } })
    assert("insert-before keeps order", JSON.stringify(kidsText(client.regions.panel)) === '["A","B","C","Save 1",""]', JSON.stringify(kidsText(client.regions.panel)))

    // text segment patch
    feed({ op: "text", id: 17, value: "2" })
    assert("a text patch rewrites one segment", client.nodes[15].item.text === "Save 2", client.nodes[15].item.text)

    // attr coercion and restore
    feed({ op: "attr", id: 18, name: "gap", value: "7" })
    assert("a string coerces to the property's type", client.nodes[18].item.gap === 7, client.nodes[18].item.gap)
    feed({ op: "attr", id: 18, name: "visible", value: null })
    assert("a removed attribute restores the default", client.nodes[18].item.visible === true, client.nodes[18].item.visible)
    feed({ op: "attr", id: 18, name: "nope", value: 1 })
    assert("an unknown attribute is ignored", true)

    // events: listened, then unlistened
    sent = []
    client.nodes[15].item.ev("click", { button: 0 })
    assert("a listened event goes up", sent.length === 1, sent.length)
    feed({ op: "unlisten", id: 15, type: "click" })
    client.nodes[15].item.ev("click", { button: 0 })
    assert("an unlistened event stays here", sent.length === 1, sent.length)
    client.nodes[11].item.ev("click", {})
    assert("a node nobody listens to sends nothing", sent.length === 1, sent.length)

    // region events reach the host too
    var seen = null
    client.regionEvent.connect(function (name, type) { seen = name + ":" + type })
    client.regions.bar.ev("click", { button: 0 })
    assert("a bar click is reported as a region event", seen === "bar:click", seen)

    // remove
    feed({ op: "remove", id: 20 })
    assert("a removed node leaves the map", client.nodes[20] === undefined && client.nodes[21] === undefined)
    step2.start()
  }

  function run2() {
    assert("a removed node leaves its slot", JSON.stringify(kidsText(client.regions.panel)) === '["A","C","Save 2",""]', JSON.stringify(kidsText(client.regions.panel)))
    // a second mount — what a reconnect produces — must rebuild, not tear the client down
    feed(tree())
    assert("a second mount is applied", client.phase === "live" && client.regions.bar && client.regions.bar.text === "3 procs")
    step3.start()
  }

  function run3() {
    assert("the client survives a second mount", root.client !== null && root.client.phase === "live", root.client ? root.client.phase : "destroyed")
    assert("the old regions were replaced", stage.children.length === 2, stage.children.length)
    framerBounds()
    say({ done: true })
    Qt.quit()
  }

  /* The framer alone, on a frame that never closes: it must give the
   * frame up at MAX_FRAME instead of buffering until the shell dies,
   * and pick up the next good frame after it. Protocol.js is only
   * reachable by URL here, so it is imported through a throwaway object. */
  function framerBounds() {
    var errors = []
    var patches = []
    var proto = Qt.createQmlObject(
      'import QtQuick\nimport "file://' + root.dir + '/yeetkit/Protocol.js" as Protocol\n' +
      'QtObject { property int max: Protocol.MAX_FRAME; function framer(a, b) { return Protocol.framer(a, b) } }', root)
    var feed = proto.framer(function (p) { patches.push(p) }, function (e, body) { errors.push(String(e) + "|" + body.length) })
    var max = proto.max
    assert("the framer has a frame ceiling", max > 0 && max <= 64 * 1024 * 1024, max)

    // an unclosed frame fed in chunks past the ceiling
    var piece = new Array(64 * 1024 + 1).join("x")
    feed("\x1b]7880;" + '{"op":"mount","pad":"')
    for (var fed = 0; fed <= max; fed += piece.length) feed(piece)
    assert("an oversized open frame is rejected once", errors.length === 1 && /exceeds/.test(errors[0]), JSON.stringify(errors))
    assert("the rejection carries only a preview of the body", errors.length === 1 && parseInt(errors[0].split("|")[1]) <= 200, errors[0])
    assert("nothing was handed out for it", patches.length === 0, patches.length)

    // the rest of that body, and its terminator, are noise
    feed(piece + '"}' + "\x07")
    assert("the oversized frame's tail is ignored", errors.length === 1 && patches.length === 0, errors.length + "/" + patches.length)

    // the wire recovers at the next opener
    feed(frame({ op: "text", id: 1, value: "ok" }))
    assert("the next frame after an oversized one is delivered", patches.length === 1 && patches[0].value === "ok", JSON.stringify(patches))

    // a closed frame over the ceiling is refused before it is parsed
    feed("\x1b]7880;" + '{"op":"mount","pad":"' + new Array(max + 2).join("y") + '"}' + "\x07")
    assert("an oversized closed frame is rejected", errors.length === 2 && /exceeds/.test(errors[1]), JSON.stringify(errors))
    assert("frames after it still arrive", (feed(frame({ op: "text", id: 1, value: "again" })), patches.length === 2), patches.length)
    proto.destroy()
  }

  property string dir: ""

  Timer { interval: 5000; running: true; onTriggered: { say({ done: false, detail: "timeout" }); Qt.quit() } }

  Component.onCompleted: {
    var args = Qt.application.arguments
    var dir = args[args.indexOf("--") + 1]
    root.dir = dir
    var kit = Qt.createComponent("file://" + dir + "/yeetkit/Yeetkit.qml")
    if (kit.status === Component.Error) { say({ done: false, detail: kit.errorString() }); Qt.quit(); return }
    client = kit.createObject(root, { transportComponent: fake })
    client.regionChanged.connect(host)
    step1.start()
  }
}
