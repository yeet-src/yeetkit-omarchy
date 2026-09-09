import QtQuick

// Any tag without a node of its own. Its children still render, stacked.
Column {
  id: root
  property var client: null
  property int nodeId: 0
  property Item slot: root
  signal ev(string type, var payload)

  width: parent ? parent.width : implicitWidth
}
