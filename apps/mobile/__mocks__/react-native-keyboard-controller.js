const React = require('react');
const { ScrollView } = require('react-native');

function KeyboardAwareScrollView({ children, ...props }) {
  return React.createElement(ScrollView, props, children);
}

function KeyboardProvider({ children }) {
  return children;
}

module.exports = {
  KeyboardAwareScrollView,
  KeyboardProvider,
};
