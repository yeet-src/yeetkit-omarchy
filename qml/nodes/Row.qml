import QtQuick
import qs.Commons

// <row gap fill>  children side by side
Row {
  id: root
  property var client: null
  property int nodeId: 0
  property Item slot: root
  signal ev(string type, var payload)

  property int gap: Style.spacing.sm
  property bool fill: false

  spacing: gap
  width: fill && parent ? parent.width : implicitWidth
}
