import QtQuick
import QtWebSockets
import "Protocol.js" as Protocol

/* One reconnecting socket to a yeet portal. Both lanes use this: the
 * tty, which carries events up and (normally) the view down, and in
 * direct mode the console lane, which carries the view alone.
 *
 * Needs the QtWebSockets QML module — the `qt6-websockets` package on
 * Arch. Omarchy does not ship it; a plugin's README has to say so.
 */
QtObject {
  id: root

  property string url: ""
  readonly property bool live: socket.status === WebSocket.Open

  signal message(string text)
  signal opened()
  signal closed()

  property int backoff: 250

  function send(buffer) {
    if (socket.status !== WebSocket.Open) return false
    socket.sendBinaryMessage(buffer)
    return true
  }

  property WebSocket socket: WebSocket {
    url: root.url
    active: root.url !== ""

    onTextMessageReceived: function (text) { root.message(text) }
    onBinaryMessageReceived: function (bytes) { root.message(Protocol.bytesToString(bytes)) }

    onStatusChanged: function () {
      if (status === WebSocket.Open) {
        root.backoff = 250
        root.opened()
      } else if (status === WebSocket.Closed || status === WebSocket.Error) {
        root.closed()
        if (root.url !== "") retry.restart()
      }
    }
  }

  /* A dropped socket is routine — the dev loop restarts the isolate on
   * every edit — so the retry is quiet and backs off to a few seconds. */
  property Timer retry: Timer {
    interval: root.backoff
    repeat: false
    onTriggered: {
      root.backoff = Math.min(root.backoff * 2, 4000)
      socket.active = false
      socket.active = true
    }
  }
}
