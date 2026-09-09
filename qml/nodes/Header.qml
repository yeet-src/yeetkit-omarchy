import QtQuick
import qs.Ui

// <header>  a section heading, as the first-party panels draw one
PanelSectionHeader {
  id: root
  property var client: null
  property int nodeId: 0
  property Item slot: null
  signal ev(string type, var payload)

  width: parent ? parent.width : implicitWidth
}
