import QtQuick
import qs.Commons

// <text tone size bold fill wrap align>  a run of text; children are strings
//
//   tone   fg | muted | accent | urgent | bar        (or color="#hex")
//   size   caption | bodySmall | body | subtitle | title | heading | display | displayLarge
Text {
  id: root
  property var client: null
  property int nodeId: 0
  property Item slot: null
  signal ev(string type, var payload)

  property string tone: "fg"
  property string size: "body"
  property bool bold: false
  property bool fill: false
  property bool wrap: false
  property string align: "left"

  width: fill && parent ? parent.width : implicitWidth
  wrapMode: wrap ? Text.WordWrap : Text.NoWrap
  elide: !wrap && fill ? Text.ElideRight : Text.ElideNone
  color: tone === "muted" ? Color.muted
       : tone === "accent" ? Color.accent
       : tone === "urgent" ? Color.urgent
       : tone === "bar" && client && client.bar ? client.bar.barForeground
       : Color.popups.text
  font.family: Style.font.family
  font.pixelSize: Style.font[size] || Style.font.body
  font.bold: bold
  horizontalAlignment: align === "center" ? Text.AlignHCenter : align === "right" ? Text.AlignRight : Text.AlignLeft
  renderType: Text.NativeRendering
  textFormat: Text.PlainText
}
