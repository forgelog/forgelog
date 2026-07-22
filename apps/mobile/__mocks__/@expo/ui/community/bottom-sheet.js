const React = require('react');
const { View } = require('react-native');

function BottomSheet({ children, index, ...props }) {
  if (index === -1) return null;
  return React.createElement(View, { testID: 'mock-bottom-sheet', ...props }, children);
}

function BottomSheetView({ children, style }) {
  return React.createElement(View, { style }, children);
}

function BottomSheetScrollView({ children, style, ...props }) {
  return React.createElement(View, { style, ...props }, children);
}

module.exports = {
  __esModule: true,
  BottomSheet,
  BottomSheetScrollView,
  BottomSheetView,
  default: BottomSheet,
};
