import QtQuick
import qs.Commons

// Test double for the layer-shell popup: an Item with the API surface
// the generated Panel.qml uses. Content is the default property.
Item {
  id: root
  default property alias content: inner.data
  required property Item anchorItem
  required property QtObject bar
  property var owner: null
  property int margin: 5
  property int padding: Style.spacing.popupPadding
  property int contentWidth: Style.space(280)
  property int contentHeight: Style.space(200)
  property bool centerOnBar: false
  property bool open: false
  property Item focusTarget: null
  function fittedContentWidth(width, cap) { return Math.max(0, Math.round(width)) }
  function fittedContentHeight(implicitHeight, cap) { return Math.max(0, Math.round(implicitHeight)) }
  visible: open
  width: contentWidth + padding * 2
  height: contentHeight + padding * 2
  Item { id: inner; x: root.padding; y: root.padding; width: root.contentWidth; height: root.contentHeight }
}
