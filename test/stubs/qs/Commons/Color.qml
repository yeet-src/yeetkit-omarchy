pragma Singleton
import QtQuick

// Test double for Omarchy's palette singleton: the tokens the node
// vocabulary reads, with the shell's default values.
QtObject {
  property color foreground: "#cacccc"
  property color background: "#101315"
  property color accent: "#cacccc"
  property color urgent: "#a55555"
  property color muted: "#707880"
  readonly property QtObject popups: QtObject {
    property color background: "#101315"
    property color text: "#cacccc"
    property color border: "#cacccc"
  }
}
