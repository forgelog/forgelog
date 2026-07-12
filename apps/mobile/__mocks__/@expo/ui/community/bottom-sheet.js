const React = require('react');
const { View } = require('react-native');

function BottomSheet({ children, index }) {
  if (index === -1) return null;
  return React.createElement(View, null, children);
}

function BottomSheetView({ children, style }) {
  return React.createElement(View, { style }, children);
}

module.exports = {
  __esModule: true,
  BottomSheet,
  BottomSheetView,
  default: BottomSheet,
};
