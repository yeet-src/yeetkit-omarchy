import QtQuick
import qs.Commons

// <text tone size bold fill wrap align>  a run of text; children are strings
//
//   tone   fg | muted | accent | urgent | bar        (or color="#hex")
//   size   caption | bodySmall | body | subtitle | title | heading | display | displayLarge
//   fill   in a column: the full width; in a row: whatever the other
//          children leave — one per row
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

  readonly property bool inRow: parent ? parent.axis === "x" : false

  anchors.left: fill && parent && !inRow ? parent.left : undefined
  anchors.right: fill && parent && !inRow ? parent.right : undefined
  width: fill && inRow ? remaining() : implicitWidth
  wrapMode: wrap ? Text.WordWrap : Text.NoWrap
  elide: !wrap && fill ? Text.ElideRight : Text.ElideNone

  /* The row's width less every sibling and the gaps between them. Reads
   * the siblings' widths, so it follows them. */
  function remaining() {
    var row = parent
    if (!row) return implicitWidth
    var used = 0
    var shown = 0
    for (var i = 0; i < row.children.length; i++) {
      var kid = row.children[i]
      if (!kid.visible) continue
      shown += 1
      if (kid !== root) used += kid.width
    }
    return Math.max(0, row.width - used - row.spacing * Math.max(0, shown - 1))
  }
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
