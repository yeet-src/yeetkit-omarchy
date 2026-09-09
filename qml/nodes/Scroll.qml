import QtQuick
import qs.Commons

// <scroll maxHeight gap>  children stack; past maxHeight the list scrolls
Flickable {
  id: root
  property var client: null
  property int nodeId: 0
  property Item slot: inner
  signal ev(string type, var payload)

  property int maxHeight: Style.space(320)
  property int gap: Style.spacing.sm

  width: parent ? parent.width : inner.implicitWidth
  implicitHeight: Math.min(inner.implicitHeight, maxHeight)
  height: implicitHeight
  contentWidth: width
  contentHeight: inner.implicitHeight
  clip: true
  boundsBehavior: Flickable.StopAtBounds

  Column {
    id: inner
    width: root.width
    spacing: root.gap
  }
}
