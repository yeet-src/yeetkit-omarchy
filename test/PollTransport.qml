import QtQuick

/* A test-only transport: the same `send`/`message`/`opened`/`closed`
 * contract as WebSocketTransport, over HTTP polling to the bridge
 * check.mjs runs. Plain QtQuick has XMLHttpRequest and no WebSocket,
 * and this is what lets the client be driven under `qml6` on a machine
 * without qt6-websockets or Quickshell. */
QtObject {
  id: root

  property string url: ""
  property bool live: false
  property int since: 0

  signal message(string text)
  signal opened()
  signal closed()

  function send(buffer) {
    var view = new Uint8Array(buffer)
    var text = ""
    for (var i = 0; i < view.length; i++) text += String.fromCharCode(view[i])
    var xhr = new XMLHttpRequest()
    xhr.open("POST", url + "/up")
    xhr.send(text)
    return true
  }

  function poll() {
    var xhr = new XMLHttpRequest()
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== XMLHttpRequest.DONE) return
      if (xhr.status !== 200) {
        if (root.live) { root.live = false; root.closed() }
        return
      }
      var reply = JSON.parse(xhr.responseText)
      if (reply.open && !root.live) { root.live = true; root.opened() }
      if (!reply.open && root.live) { root.live = false; root.closed() }
      for (var i = 0; i < reply.frames.length; i++) root.message(reply.frames[i])
      root.since = reply.next
    }
    xhr.open("GET", url + "/down?since=" + since)
    xhr.send()
  }

  property Timer timer: Timer {
    interval: 40
    running: root.url !== ""
    repeat: true
    onTriggered: root.poll()
  }
}
