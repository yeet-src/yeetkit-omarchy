import QtQuick
import qs.Ui

// <toggle label description checked onChange>
// Controlled: the click reports the state the user asked for, and
// `checked` follows whatever the app decides.
Toggle {
  id: root
  property var client: null
  property int nodeId: 0
  property Item slot: null
  signal ev(string type, var payload)

  width: parent ? parent.width : implicitWidth

  onClicked: ev("change", { checked: !checked })
}
