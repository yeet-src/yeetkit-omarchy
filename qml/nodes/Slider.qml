import QtQuick
import qs.Ui

// <slider value minimum maximum step integer onInput onChange>
// `input` fires while dragging, `change` on release — both carry `value`.
PanelSlider {
  id: root
  property var client: null
  property int nodeId: 0
  property Item slot: null
  signal ev(string type, var payload)

  bar: client ? client.bar : null
  width: parent ? parent.width : implicitWidth

  onMoved: function (next) { ev("input", { value: next }) }
  onReleased: function (next) { ev("change", { value: next }) }
}
