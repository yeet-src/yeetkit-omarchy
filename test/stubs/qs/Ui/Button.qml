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
  /* The real Button exposes these; assigning one in QML against a stub
   * that lacks it is a load error, not a silent no-op. */
  property real fontSize: Style.font.body
  property real horizontalPadding: Style.spacing.controlPaddingX
  property real verticalPadding: Style.spacing.controlPaddingY
  signal clicked()
  signal rightClicked()
  signal hovered(bool isHovered)
  color: "transparent"
  border.width: bordered ? 1 : 0
  border.color: Style.normalBorderColor
  implicitWidth: label.implicitWidth + root.horizontalPadding * 2
  implicitHeight: Math.max(label.implicitHeight + root.verticalPadding * 2, Style.spacing.controlHeight)
  Text { id: label; anchors.centerIn: parent; text: root.iconText ? root.iconText + " " + root.text : root.text; color: root.foreground; font.family: Style.font.family; font.pixelSize: root.fontSize }
  MouseArea { anchors.fill: parent; acceptedButtons: Qt.LeftButton | Qt.RightButton; onClicked: function (mouse) { mouse.button === Qt.RightButton ? root.rightClicked() : root.clicked() } }
}
