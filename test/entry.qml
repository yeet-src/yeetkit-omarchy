import QtQuick
import Stubs

/* The generated entry files, headless.
 *
 *   qml6 -I test/stubs test/entry.qml -- <plugin-dir> <bridge-url>
 *
 * Loads `<plugin-dir>/BarWidget.qml` — which loads Panel.qml, the
 * client, the stdio transport and the Isolate singleton — against
 * doubles of qs.Ui, qs.Commons and Quickshell.Io. The singleton's
 * Process is a stub that runs nothing, so this wires its stdin and
 * stdout to the HTTP bridge check.mjs runs in front of the real
 * isolate: what the singleton writes goes up, what comes down is
 * pushed into its SplitParser as if the process had printed it.
 * Reports `ENTRY {json}` lines.
 */
Item {
  id: root
  width: 800
  height: 600

  property var widget: null
  property var iso: null
  property string url: ""
  property int since: 0
  property int posted: 0

  function say(payload) { console.log("ENTRY " + JSON.stringify(payload)) }
  function assert(label, ok, detail) { say({ label: label, ok: !!ok, detail: ok ? undefined : String(detail) }) }

  /* What the host bar injects into a widget: the members WidgetButton,
   * Panel and the entries read from it. */
  QtObject {
    id: fakeBar
    property color barForeground: "#cacccc"
    property color foreground: "#cacccc"
    property color background: "#101315"
    property color urgent: "#a55555"
    property string fontFamily: "monospace"
    property string position: "top"
    property bool vertical: false
    property int barSize: 26
    property bool foregroundAnimationEnabled: false
    property int switched: 0
    function showTooltip(target, text) {}
    function hideTooltip(target) {}
    function registerClickTarget(target) {}
    function unregisterClickTarget(target) {}
    function switchPanelFrom(owner, direction) { switched += 1; return true }
    function moduleWidgets(id) { return [] }
    function run(command) {}
  }

  Item { id: barSlot; width: 200; height: 26 }

  // ---- the bridge, on the stub Process --------------------------------

  function pump() {
    var process = iso.process
    // up: whatever the singleton wrote to "stdin"
    while (process.written.length > 0) {
      var text = process.written.shift()
      var up = new XMLHttpRequest()
      up.open("POST", url + "/up")
      up.send(text)
      posted += 1
    }
    // down: the isolate's output, into the stdout parser
    var xhr = new XMLHttpRequest()
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== XMLHttpRequest.DONE || xhr.status !== 200) return
      var reply = JSON.parse(xhr.responseText)
      for (var i = 0; i < reply.frames.length; i++) process.stdout.read(reply.frames[i])
      root.since = reply.next
    }
    xhr.open("GET", url + "/down?since=" + since)
    xhr.send()
  }

  Timer { id: pumping; interval: 40; repeat: true; onTriggered: root.pump() }

  // ---- phases -----------------------------------------------------------

  Timer { id: giveUp; interval: 9000; onTriggered: { say({ event: "timeout", phase: root.widget && root.widget.client ? "?" : "none" }); Qt.quit() } }
  Timer { id: settle; interval: 600; onTriggered: root.phase1() }
  Timer { id: afterOpen; interval: 900; onTriggered: root.phase2() }
  Timer { id: afterClose; interval: 300; onTriggered: root.phase3() }
  Timer { id: afterDestroy; interval: 300; onTriggered: root.phase4() }

  property int postedAtOpen: 0

  function phase1() {
    var w = widget
    assert("the bar item arrived from the tree", w.barItem !== null, "barItem null")
    if (w.barItem) {
      assert("it is hosted in the widget", w.barItem.parent !== null && w.barItem.width > 0 && w.barItem.text.trim().length > 0, JSON.stringify({ parent: String(w.barItem.parent), width: w.barItem.width, text: w.barItem.text }))
      assert("the widget sizes itself from it", w.implicitWidth > 0 && w.implicitWidth === w.barItem.implicitWidth, w.implicitWidth + " vs " + w.barItem.implicitWidth)
    }
    assert("the app's <panel> was noticed", w.hasPanel === true, w.hasPanel)
    assert("the widget starts closed", w.opened === false, w.opened)

    postedAtOpen = posted
    w.toggle()
    afterOpen.start()
  }

  function phase2() {
    var w = widget
    assert("toggle() opens the panel", w.opened === true, w.opened)
    assert("opening sent the open event up", posted > postedAtOpen, posted + " <= " + postedAtOpen)
    w.close()
    afterClose.start()
  }

  function phase3() {
    assert("close() closes it", widget.opened === false, widget.opened)
    assert("the singleton counts one client", iso.clients === 1, iso.clients)
    assert("the stub process was started by the first attach", iso.process.running === true && Stubs.lastCommand.indexOf("script -qfec 'yeet' 'run'") === 0, Stubs.lastCommand)
    widget.destroy()
    afterDestroy.start()
  }

  function phase4() {
    assert("destroying the widget detaches its client", iso.clients === 0, iso.clients)
    assert("the isolate is kept for a grace period, not killed at once", iso.process.running === true && iso.stopTimer.running === true, JSON.stringify({ running: iso.process.running, stopping: iso.stopTimer.running }))
    say({ done: true })
    Qt.quit()
  }

  Component.onCompleted: {
    var args = Qt.application.arguments
    var at = args.indexOf("--")
    var dir = args[at + 1]
    url = args[at + 2]

    /* The singleton, by importing the plugin's runtime directory. */
    try {
      var probe = Qt.createQmlObject('import QtQuick\nimport "file://' + dir + '/yeetkit" as Kit\nQtObject { readonly property var isolate: Kit.Isolate }', root)
      iso = probe.isolate
    } catch (error) {
      say({ done: false, detail: "Isolate singleton: " + error })
      Qt.quit()
      return
    }
    assert("the singleton is idle before any widget", iso.process.running === false && iso.clients === 0)

    var entry = Qt.createComponent("file://" + dir + "/BarWidget.qml")
    if (entry.status === Component.Error) { say({ done: false, detail: "BarWidget.qml: " + entry.errorString() }); Qt.quit(); return }
    widget = entry.createObject(barSlot, { bar: fakeBar })
    if (!widget) { say({ done: false, detail: "BarWidget.qml: " + entry.errorString() }); Qt.quit(); return }
    assert("BarWidget.qml instantiates", true)
    assert("its module name is the plugin id", widget.moduleName.length > 0 && widget.moduleName.indexOf("__") < 0, widget.moduleName)
    assert("a placeholder keeps the slot before the tree arrives", widget.implicitWidth > 0 && widget.barItem === null, widget.implicitWidth)

    pumping.start()
    giveUp.start()
    widget.client.phaseChanged.connect(function () {
      if (widget.client.phase === "live" && !settle.running) settle.start()
    })
    say({ event: "started" })
  }
}
