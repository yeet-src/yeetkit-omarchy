import QtQuick
import qs.Commons

// Test double for the popup base: the lifecycle the generated Panel.qml
// entry forwards, without IPC.
Item {
  id: root
  property QtObject bar: null
  property string moduleName: ""
  property var settings: ({})
  property string ipcTarget: ""
  property bool manageIpc: true
  property alias controller: panelController
  property bool popoutSwitching: false
  property bool popoutSwitchClosing: false
  readonly property bool opened: panelController.open
  readonly property color barForeground: Color.foreground
  function open() { panelController.show() }
  function close() { panelController.hide() }
  function closeForPopoutSwitch() { popoutSwitchClosing = true; close(); Qt.callLater(function () { popoutSwitchClosing = false }) }
  function toggle() { opened ? close() : open() }
  PanelController { id: panelController }
}
