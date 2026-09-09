import QtQuick
import QtQuick.Controls
TextField {
  property bool password: false
  property bool hasCursor: false
  echoMode: password ? TextInput.Password : TextInput.Normal
}
