import QtQuick
import qs.Commons

// Test double for the bar's button: the properties and signals Bar.qml
// uses, sized from its label like the real one.
Item {
  id: root
  property var bar: null
  property string text: ""
  property string tooltipText: ""
  property bool active: false
  /* The real WidgetButton exposes these, and <bar heat> binds
   * `foreground`; without them the node fails to instantiate here while
   * working against the shell. */
  property color foreground: Color.foreground
  property color activeColor: Color.urgent
  property bool useActiveColor: true
  property bool dimmed: false
  property bool keepSpace: false
  property bool pressable: true
  property bool concealed: false
  property bool interactive: true
  property real fixedWidth: -1
  property real fixedHeight: -1
  property bool hasVisualContent: text !== ""
  property bool labelVisible: true
  /* What Bar.qml reads off the real button for its image row. */
  property int barSize: 26
  property real scaledHorizontalMargin: 8
  property string fontFamily: Style.font.family
  property int fontSize: Style.font.body
  signal pressed(int button)
  signal wheelMoved(int delta)
  visible: hasVisualContent || keepSpace
  implicitWidth: Math.max(12, label.implicitWidth + 17)
  implicitHeight: 26
  Text { id: label; anchors.centerIn: parent; text: root.text; color: root.active && root.useActiveColor ? root.activeColor : root.foreground; font.family: Style.font.family; font.pixelSize: Style.font.body }
  MouseArea { anchors.fill: parent; acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton; onClicked: function (mouse) { root.pressed(mouse.button) } }
}
