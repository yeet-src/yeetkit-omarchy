import QtQuick
import qs.Ui

// <bar tooltipText active dimmed onClick onWheel>  the widget in the bar.
// Its children are strings — the label — and it borrows every bit of
// chrome from the host's own WidgetButton: hover, tooltip, click
// registration, vertical bars.
WidgetButton {
  id: root
  property var client: null
  property int nodeId: 0
  property Item slot: null
  signal ev(string type, var payload)

  bar: client ? client.bar : null

  onPressed: function (button) {
    ev("click", { button: button === Qt.LeftButton ? 0 : button === Qt.MiddleButton ? 1 : 2 })
  }
  onWheelMoved: function (delta) { ev("wheel", { delta: delta }) }
}
