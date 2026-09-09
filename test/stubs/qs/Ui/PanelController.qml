import QtQuick
QtObject {
  property bool open: false
  function show() { open = true }
  function hide() { open = false }
}
