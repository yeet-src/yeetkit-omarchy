import QtQuick
import Stubs

// Test double: the surface Isolate.qml uses. Runs nothing; records
// what it was asked, so the harness can report the command line.
QtObject {
  id: root
  property var command: []
  property bool running: false
  property bool stdinEnabled: false
  property var stdout: null
  property var stderr: null
  property var written: []
  signal started()
  signal exited(int exitCode, int exitStatus)
  function write(data) { written.push(String(data)) }
  function signal(number) { running = false; exited(0, 0) }
  onRunningChanged: if (running) { Stubs.lastCommand = command.join(" "); started() }
}
