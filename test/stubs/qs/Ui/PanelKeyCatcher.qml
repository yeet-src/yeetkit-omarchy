import QtQuick

// Test double with the real one's signals; keys are not simulated here.
Item {
  id: root
  property bool blocked: false
  signal moveRequested(int dx, int dy)
  signal activateRequested()
  signal returnRequested()
  signal closeRequested()
  signal deleteRequested()
  signal tabRequested(int direction)
  signal textKey(string text)
  focus: true
}
