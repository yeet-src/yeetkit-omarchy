import QtQuick
import qs.Commons

// <panel contentWidth gap open onOpen onClose>  the popup under the bar
// widget. Children stack; the entry file anchors and frames it.
//
// `open` goes app -> shell: set it and the panel is shown or hidden.
// `open`/`close` events go shell -> app, so a page can start a stream
// only while someone is looking.
Item {
  id: root
  property var client: null
  property int nodeId: 0
  property Item slot: inner
  signal ev(string type, var payload)

  property int contentWidth: Style.space(280)
  property int gap: Style.spacing.md
  property var open: undefined

  signal openRequested(bool wanted)
  onOpenChanged: if (open === true || open === false) openRequested(open)

  property bool shown: false
  function shellOpened(isOpen) {
    if (shown === isOpen) return
    shown = isOpen
    ev(isOpen ? "open" : "close", {})
  }

  width: parent ? parent.width : contentWidth
  implicitHeight: inner.implicitHeight
  height: implicitHeight

  Column {
    id: inner
    width: root.width
    spacing: root.gap
  }
}
