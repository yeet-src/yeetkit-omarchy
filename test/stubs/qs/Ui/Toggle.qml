import QtQuick
import qs.Commons
Item {
  id: root
  property string label: ""
  property string description: ""
  property bool checked: false
  property bool hasCursor: false
  signal clicked()
  signal hovered(bool isHovered)
  implicitHeight: Style.spacing.controlHeight
  implicitWidth: 200
  Text { text: (root.checked ? "[x] " : "[ ] ") + root.label; color: Color.foreground; font.family: Style.font.family; font.pixelSize: Style.font.body }
  MouseArea { anchors.fill: parent; onClicked: root.clicked() }
}
