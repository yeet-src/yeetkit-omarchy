pragma Singleton
import QtQuick

// Test double for Omarchy's structural tokens: the subset the node
// vocabulary reads.
QtObject {
  id: root
  property int cornerRadius: 0
  property int normalBorderWidth: 1
  readonly property color normalFill: Qt.rgba(0.79, 0.8, 0.8, 0.04)
  readonly property color normalBorderColor: Qt.rgba(0.79, 0.8, 0.8, 0.4)
  function space(px) { return Math.round(px) }
  function spaceReal(px) { return px }
  readonly property QtObject spacing: QtObject {
    readonly property int xxs: 2
    readonly property int xs: 3
    readonly property int sm: 4
    readonly property int md: 6
    readonly property int lg: 8
    readonly property int xl: 10
    readonly property int controlPaddingX: 10
    readonly property int controlPaddingY: 6
    readonly property int controlHeight: 28
    readonly property int popupPadding: 14
  }
  readonly property QtObject font: QtObject {
    readonly property string family: "monospace"
    readonly property int caption: 10
    readonly property int bodySmall: 11
    readonly property int body: 12
    readonly property int subtitle: 13
    readonly property int title: 14
    readonly property int heading: 16
    readonly property int display: 24
    readonly property int displayLarge: 28
    readonly property int icon: 14
    readonly property int iconSmall: 11
  }
  readonly property QtObject bar: QtObject {
    readonly property int sizeHorizontal: 26
  }
}
