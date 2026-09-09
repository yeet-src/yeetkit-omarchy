import QtQuick
import qs.Commons
Rectangle {
  id: root
  property string text: ""
  property string iconText: ""
  property string tooltipText: ""
  property bool selected: false
  property bool active: false
  property bool hasCursor: false
  property bool focusable: false
  property bool bordered: false
  property color foreground: Color.foreground
  signal clicked()
  signal rightClicked()
  signal hovered(bool isHovered)
  color: "transparent"
  border.width: bordered ? 1 : 0
  border.color: Style.normalBorderColor
  implicitWidth: label.implicitWidth + Style.spacing.controlPaddingX * 2
  implicitHeight: Style.spacing.controlHeight
  Text { id: label; anchors.centerIn: parent; text: root.iconText ? root.iconText + " " + root.text : root.text; color: root.foreground; font.family: Style.font.family; font.pixelSize: Style.font.body }
  MouseArea { anchors.fill: parent; acceptedButtons: Qt.LeftButton | Qt.RightButton; onClicked: function (mouse) { mouse.button === Qt.RightButton ? root.rightClicked() : root.clicked() } }
}
