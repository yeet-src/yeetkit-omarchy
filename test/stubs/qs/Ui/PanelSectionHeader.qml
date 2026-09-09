import QtQuick
import qs.Commons
Text {
  property color foreground: Color.foreground
  color: foreground
  font.family: Style.font.family
  font.pixelSize: Style.font.caption
  font.bold: true
}
