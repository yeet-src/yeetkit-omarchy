import QtQuick
import qs.Ui

// <separator>  a hairline between sections
PanelSeparator {
  id: root
  property var client: null
  property int nodeId: 0
  property Item slot: null
  signal ev(string type, var payload)

  width: parent ? parent.width : implicitWidth
}
