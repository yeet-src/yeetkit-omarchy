import QtQuick
QtObject {
  property string path: ""
  property bool watchChanges: false
  signal fileChanged()
  signal loaded()
}
