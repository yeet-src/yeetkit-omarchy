import QtQuick
import "Protocol.js" as Protocol

/* The shell half of a yeetkit app: a mirror of the tree the isolate
 * holds, built out of QML items instead of DOM nodes.
 *
 * It knows nothing about the application. It keeps a map of id ->
 * record, applies the patches that arrive, sends events back up, and
 * hands the entry files the *regions* they display — the `<bar>` and
 * `<panel>` elements, wherever they sit in the tree. Everything else
 * is a node inside one of those.
 *
 * Where the browser client creates DOM elements by tag, this one
 * creates a QML component per tag from `nodes/`. A node component is
 * an ordinary Item with three conventions: a `slot` Item that its
 * children are reparented into (null for a leaf), plain properties
 * named as the JSX attributes are, and an `ev(type, payload)` signal
 * for what the user did. Text nodes have no item of their own: their
 * parent's `text` property is the join of its text children, which is
 * how `<button>Save {n()}</button>` patches one segment.
 */
Item {
  id: client
  visible: false
  width: 0
  height: 0

  /** The isolate's tty portal: events up, and the view down unless `viewUrl` is set. */
  property string url: ""
  /** Direct mode: the console lane, carrying the view alone. */
  property string viewUrl: ""
  /** The host bar, for the chrome a bar node borrows from it. */
  property var bar: null
  property string path: "/"
  property string title: ""

  /** connecting | connected | live | reconnecting */
  property string state: "connecting"
  readonly property bool live: state === "live"

  /** Region name -> its Item, as the tree stands now. */
  property var regions: ({})
  /** Set by an input node while it holds focus, so a panel's key catcher stands aside. */
  property bool inputFocus: false

  /** A transport component to use instead of the WebSocket one — tests swap this in. */
  property Component transportComponent: null

  signal regionChanged(string name, Item item)
  signal regionEvent(string name, string type, var payload)
  /** Every patch applied, in order — for tests and tooling. */
  signal applied(var patch)

  readonly property var regionTags: ["bar", "panel"]

  // ---- the wire --------------------------------------------------------

  property var lane: null
  property var viewLane: null
  property var framer: null

  Component.onCompleted: connect()

  function connect() {
    if (lane) return
    framer = Protocol.framer(
      function (patch) { apply(patch) },
      function (error, body) { console.warn("yeetkit: bad frame: " + error + " " + body) }
    )
    var component = transportComponent || Qt.createComponent(Qt.resolvedUrl("WebSocketTransport.qml"))
    if (component.status === Component.Error) {
      console.warn("yeetkit: transport failed to load: " + component.errorString())
      return
    }
    lane = openLane(component, url)
    if (viewUrl !== "") viewLane = openLane(component, viewUrl)
  }

  function openLane(component, address) {
    var made = component.createObject(client, { url: address })
    if (!made) {
      console.warn("yeetkit: transport failed: " + component.errorString())
      return null
    }
    made.message.connect(function (text) { framer(text) })
    made.opened.connect(hello)
    made.closed.connect(dropped)
    return made
  }

  /* `hello` is what sends the tree, and in direct mode the tree comes
   * back on the other socket — so it waits until both are open, and is
   * repeated whenever either one comes back. */
  function hello() {
    if (!lane || !lane.live) return
    if (viewLane && !viewLane.live) return
    state = "connected"
    up({ t: "hello", path: path })
  }

  function dropped() {
    state = "reconnecting"
  }

  function up(message) {
    if (!lane) return false
    return lane.send(Protocol.encodeUplink(message))
  }

  /** A key the shell caught and the app may want: `{key, ctrl, alt, shift}`. */
  function key(spec) {
    up({
      t: "key",
      key: spec.key,
      code: spec.code || "",
      ctrl: !!spec.ctrl,
      alt: !!spec.alt,
      shift: !!spec.shift,
      meta: !!spec.meta
    })
  }

  // ---- the tree --------------------------------------------------------

  /* id -> record. A record is { id, tag, item, kids, parent, on,
   * defaults } for an element and { id, text, parent } for text. Plain
   * objects, mutated in place: nothing binds to them. */
  property var nodes: ({})
  property var components: ({})

  function fileFor(tag) {
    var name = String(tag).split("-").map(function (part) {
      return part.charAt(0).toUpperCase() + part.slice(1)
    }).join("")
    return "nodes/" + name + ".qml"
  }

  function componentFor(tag) {
    if (components[tag]) return components[tag]
    var component = Qt.createComponent(Qt.resolvedUrl(fileFor(tag)))
    if (component.status === Component.Error) {
      console.warn("yeetkit: no node for <" + tag + ">: " + component.errorString().trim())
      component = Qt.createComponent(Qt.resolvedUrl("nodes/Unknown.qml"))
    }
    components[tag] = component
    return component
  }

  function isRegion(tag) {
    return regionTags.indexOf(tag) >= 0
  }

  function build(spec, parentRec) {
    if (spec.text !== undefined) {
      var textRec = { id: spec.id, text: String(spec.text), parent: parentRec }
      nodes[spec.id] = textRec
      return textRec
    }

    var rec = { id: spec.id, tag: spec.tag, item: null, kids: [], parent: parentRec, on: {}, defaults: {} }
    nodes[spec.id] = rec

    var component = componentFor(spec.tag)
    /* The client is the QObject parent — that is what keeps the item
     * alive until `destroy` — and the slot it is shown in is only its
     * visual parent, set when it is placed. */
    var item = component.createObject(client, { client: client, nodeId: spec.id })
    if (!item) {
      console.warn("yeetkit: <" + spec.tag + "> failed: " + component.errorString().trim())
      item = componentFor("unknown").createObject(client, { client: client, nodeId: spec.id })
    }
    rec.item = item
    if (item.ev) {
      item.ev.connect(function (type, payload) { dispatch(rec, type, payload) })
    }

    var attrs = spec.attrs || {}
    for (var name in attrs) setAttr(rec, name, attrs[name])
    var on = spec.on || []
    for (var i = 0; i < on.length; i++) rec.on[on[i]] = true

    var kids = spec.kids || []
    for (var k = 0; k < kids.length; k++) {
      var kid = build(kids[k], rec)
      rec.kids.push(kid)
      place(rec, kid, null)
    }
    retext(rec)

    if (isRegion(spec.tag)) register(rec)
    return rec
  }

  /* Puts a child where its parent shows children. A region is owned
   * by an entry file and never placed here; a text node has no item
   * and only changes its parent's text. */
  function place(parentRec, kidRec, beforeRec) {
    if (kidRec.text !== undefined) {
      retext(parentRec)
      return
    }
    if (isRegion(kidRec.tag)) return

    var slot = parentRec.item ? parentRec.item.slot : null
    if (!slot) {
      /* A parent that holds no children — the root, or a text-only
       * node like <bar>. The item exists so its ids stay valid; it just
       * has nowhere to be seen. */
      kidRec.item.visible = false
      return
    }
    kidRec.item.parent = slot
    if (beforeRec && beforeRec.item && beforeRec.item.parent === slot) moveBefore(slot, kidRec.item, beforeRec.item)
  }

  /* QML children are ordered by arrival and there is no insertBefore:
   * to put `item` before `anchor`, everything from the anchor on is
   * re-appended after it. Linear in the tail — fine for a panel. */
  function moveBefore(slot, item, anchor) {
    var kids = slot.children
    var tail = []
    var found = false
    for (var i = 0; i < kids.length; i++) {
      var kid = kids[i]
      if (kid === item) continue
      if (kid === anchor) found = true
      if (found) tail.push(kid)
    }
    for (var t = 0; t < tail.length; t++) {
      tail[t].parent = null
      tail[t].parent = slot
    }
  }

  function retext(rec) {
    if (!rec || !rec.item || !("text" in rec.item)) return
    var joined = ""
    for (var i = 0; i < rec.kids.length; i++) {
      if (rec.kids[i].text !== undefined) joined += rec.kids[i].text
    }
    if (rec.item.text !== joined) rec.item.text = joined
  }

  function coerce(fallback, value) {
    switch (typeof fallback) {
      case "number":
        if (typeof value === "number") return value
        if (value === true) return 1
        if (value === false) return 0
        var n = Number(value)
        return isNaN(n) ? fallback : n
      case "boolean":
        if (typeof value === "boolean") return value
        if (typeof value === "number") return value !== 0
        return value !== "false" && value !== "0"
      case "string":
        return String(value)
      default:
        return value
    }
  }

  function setAttr(rec, name, value) {
    var item = rec.item
    if (!item || !(name in item)) return
    if (!(name in rec.defaults)) rec.defaults[name] = item[name]
    var next = value === null || value === undefined ? rec.defaults[name] : coerce(rec.defaults[name], value)
    try {
      item[name] = next
    } catch (error) {
      console.warn("yeetkit: <" + rec.tag + " " + name + "=" + JSON.stringify(value) + ">: " + error)
    }
  }

  function dispatch(rec, type, payload) {
    if (isRegion(rec.tag)) regionEvent(rec.tag, type, payload || {})
    if (rec.on[type]) up({ t: "event", id: rec.id, type: type, payload: payload || {} })
  }

  function destroy(rec) {
    if (rec.kids) {
      for (var i = 0; i < rec.kids.length; i++) destroy(rec.kids[i])
    }
    if (rec.item) {
      if (isRegion(rec.tag)) unregister(rec)
      rec.item.parent = null
      rec.item.destroy()
      rec.item = null
    }
    delete nodes[rec.id]
  }

  function register(rec) {
    var next = {}
    for (var name in regions) next[name] = regions[name]
    next[rec.tag] = rec.item
    regions = next
    regionChanged(rec.tag, rec.item)
  }

  function unregister(rec) {
    if (regions[rec.tag] !== rec.item) return
    var next = {}
    for (var name in regions) if (name !== rec.tag) next[name] = regions[name]
    regions = next
    regionChanged(rec.tag, null)
  }

  function reset() {
    var root = nodes[0]
    if (root) destroy(root)
    nodes = {}
    regions = {}
  }

  // ---- applying patches ------------------------------------------------

  function apply(patch) {
    switch (patch.op) {
      case "batch":
        for (var i = 0; i < patch.patches.length; i++) apply(patch.patches[i])
        return

      case "mount": {
        reset()
        title = patch.title || ""
        var rootRec = { id: 0, tag: "#root", item: null, kids: [], parent: null, on: {}, defaults: {} }
        nodes[0] = rootRec
        var kids = patch.root.kids || []
        for (var k = 0; k < kids.length; k++) {
          var kid = build(kids[k], rootRec)
          rootRec.kids.push(kid)
          place(rootRec, kid, null)
        }
        state = "live"
        break
      }

      case "insert": {
        var parentRec = nodes[patch.parent]
        if (!parentRec) return
        var beforeRec = patch.before === null || patch.before === undefined ? null : nodes[patch.before]
        var rec = build(patch.node, parentRec)
        var at = beforeRec ? parentRec.kids.indexOf(beforeRec) : -1
        if (at >= 0) parentRec.kids.splice(at, 0, rec)
        else parentRec.kids.push(rec)
        place(parentRec, rec, beforeRec)
        break
      }

      case "remove": {
        var gone = nodes[patch.id]
        if (!gone) return
        var owner = gone.parent
        if (owner) {
          var index = owner.kids.indexOf(gone)
          if (index >= 0) owner.kids.splice(index, 1)
        }
        destroy(gone)
        if (owner && gone.text !== undefined) retext(owner)
        break
      }

      case "text": {
        var textRec = nodes[patch.id]
        if (!textRec || textRec.text === undefined) return
        textRec.text = String(patch.value)
        retext(textRec.parent)
        break
      }

      case "attr": {
        var target = nodes[patch.id]
        if (target && target.item) setAttr(target, patch.name, patch.value)
        break
      }

      case "listen": {
        var listening = nodes[patch.id]
        if (listening && listening.on) listening.on[patch.type] = true
        break
      }

      case "unlisten": {
        var quiet = nodes[patch.id]
        if (quiet && quiet.on) delete quiet.on[patch.type]
        break
      }

      /* The isolate redirected. Nothing owns a URL bar here, but the
       * next `hello` should say where the app thinks it is. */
      case "nav":
        path = patch.href
        break

      /* Replies to island calls and streams. A plugin has no islands,
       * so nothing waits for these. */
      default:
        break
    }
    applied(patch)
  }
}
