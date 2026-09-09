import QtQuick
Item {
  id: root
  property QtObject bar: null
  property real value: 0
  property real minimum: 0
  property real maximum: 1
  property real step: 0.05
  property bool integer: false
  signal moved(real value)
  signal released(real value)
  signal rightClicked()
  implicitHeight: 28
  implicitWidth: 120
}
