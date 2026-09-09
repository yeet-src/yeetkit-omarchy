import QtQuick
import Stubs

/* Drives a built plugin's QML client against a real isolate, headless.
 *
 *   qml6 -I test/stubs test/harness.qml -- <plugin-dir> <bridge-url>
 *
 * Loads `<plugin-dir>/yeetkit/Yeetkit.qml` with the poll transport,
 * waits for the tree, and reports what it built as `HARNESS {json}`
 * lines for check.mjs to read. The entry files are not loaded — they
 * need Quickshell — so what is covered is the client and the node
 * vocabulary against stubs of the shell's components, plus that the
 * stdio transport and the Isolate singleton load against doubles of
 * Quickshell.Io and would run the right command.
 */
Item {
  id: root

  property var client: null
  property int patches: 0
  property var warnings: []

  function say(payload) { console.log("HARNESS " + JSON.stringify(payload)) }

  /* What the entry files do: regions are owned by whoever shows them,
   * and until they are reparented out of the (invisible) client they
   * have no size. */
  Item { id: stage; width: 320; height: 600; visible: true }
  function host(name, item) {
    if (!item) return
    item.parent = stage
    if (name === "panel") item.width = Qt.binding(function () { return stage.width })
  }

  function summary() {
    var regions = client.regions
    var nodes = client.nodes
    var tags = {}
    var listened = 0
    for (var id in nodes) {
      var rec = nodes[id]
      if (rec.tag === undefined) continue
      tags[rec.tag] = (tags[rec.tag] || 0) + 1
      for (var type in rec.on) listened++
    }
    var panel = regions.panel || null
    var kids = []
    if (panel && panel.slot) {
      for (var i = 0; i < panel.slot.children.length; i++) {
        var kid = panel.slot.children[i]
        kids.push({ type: String(kid).split("_QMLTYPE")[0].split("(")[0], visible: kid.visible, width: kid.width, height: kid.height })
      }
    }
    return {
      state: client.phase,
      title: client.title,
      tags: tags,
      listened: listened,
      bar: regions.bar ? { text: regions.bar.text, implicitWidth: regions.bar.implicitWidth, visible: regions.bar.visible } : null,
      panel: panel ? { contentWidth: panel.contentWidth, implicitHeight: panel.implicitHeight, kids: kids } : null
    }
  }

  function firstNode(tag, type) {
    for (var id in client.nodes) {
      var rec = client.nodes[id]
      if (rec.tag === tag && (!type || rec.on[type])) return rec
    }
    return null
  }

  Timer { id: settle; interval: 500; onTriggered: root.phase1() }
  Timer { id: afterClick; interval: 900; onTriggered: root.phase2() }
  Timer { id: afterToggle; interval: 900; onTriggered: root.phase3() }
  Timer { id: giveUp; interval: 8000; onTriggered: { root.say({ event: "timeout", state: root.client ? root.client.phase : "none" }); Qt.quit() } }

  function phase1() {
    say({ event: "live", summary: summary() })
    var button = firstNode("button", "click")
    if (!button) { say({ event: "no-button" }); phase2(); return }
    patches = 0
    button.item.ev("click", { button: 0 })
    afterClick.start()
  }

  function phase2() {
    say({ event: "clicked", patches: patches })
    var toggle = firstNode("toggle", "change")
    if (!toggle) { say({ event: "no-toggle" }); phase3(); return }
    patches = 0
    var before = toggle.item.checked
    toggle.item.ev("change", { checked: !before })
    root.toggleRec = toggle
    root.toggleBefore = before
    afterToggle.start()
  }

  property var toggleRec: null
  property bool toggleBefore: false

  function phase3() {
    if (toggleRec) say({ event: "toggled", before: toggleBefore, after: toggleRec.item.checked, patches: patches, summary: summary() })
    say({ event: "warnings", warnings: warnings })
    say({ event: "done" })
    Qt.quit()
  }

  Component.onCompleted: {
    var args = Qt.application.arguments
    var at = args.indexOf("--")
    var dir = args[at + 1]
    var url = args[at + 2]

    /* The production transport, against the Quickshell.Io doubles: it
     * has to load, attach to the singleton, and start the process. */
    var stdio = Qt.createComponent("file://" + dir + "/yeetkit/StdioTransport.qml")
    if (stdio.status === Component.Error) { say({ event: "error", where: "StdioTransport.qml", message: stdio.errorString() }) }
    else {
      var handle = stdio.createObject(root, {})
      if (!handle) say({ event: "error", where: "StdioTransport.qml", message: stdio.errorString() })
      else {
        say({ event: "stdio", live: handle.live, command: Stubs.lastCommand })
        handle.destroy()
      }
    }

    var poll = Qt.createComponent(Qt.resolvedUrl("PollTransport.qml"))
    if (poll.status === Component.Error) { say({ event: "error", where: "PollTransport", message: poll.errorString() }); Qt.quit(); return }

    var kit = Qt.createComponent("file://" + dir + "/yeetkit/Yeetkit.qml")
    if (kit.status === Component.Error) { say({ event: "error", where: "Yeetkit.qml", message: kit.errorString() }); Qt.quit(); return }

    client = kit.createObject(root, { transportComponent: poll })
    if (!client) { say({ event: "error", where: "createObject", message: kit.errorString() }); Qt.quit(); return }

    client.applied.connect(function () { root.patches++ })
    /* The poll transport is created by the client with no url; hand it one. */
    if (client.lane) client.lane.url = url
    client.regionChanged.connect(host)
    client.phaseChanged.connect(function () {
      if (client.phase === "live" && !settle.running) settle.start()
    })
    giveUp.start()
    say({ event: "started", dir: dir, url: url })
  }
}
