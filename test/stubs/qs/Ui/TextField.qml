import QtQuick
import QtQuick.Controls
TextField {
  property bool password: false
  property bool hasCursor: false
  /* The shell's field has it; the Controls one here does not. */
  property real verticalPadding: 0
  echoMode: password ? TextInput.Password : TextInput.Normal
}
