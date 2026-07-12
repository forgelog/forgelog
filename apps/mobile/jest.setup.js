/* global IS_REACT_ACT_ENVIRONMENT */
IS_REACT_ACT_ENVIRONMENT = true;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const originalConsoleError = console.error.bind(console);

// React 19 + the RN test renderer emits these known act warnings for
// Navigation/VirtualizedList async internals even when assertions await UI state.
console.error = (...args) => {
  const message = args.map((arg) => (typeof arg === 'string' ? arg : '')).join(' ');
  if (message.includes('The current testing environment is not configured to support act(...)')) {
    return;
  }
  if (message.includes('VirtualizedList') && message.includes('inside a test was not wrapped in act(...)')) {
    return;
  }
  if (message.includes('You seem to have overlapping act() calls')) {
    return;
  }
  originalConsoleError(...args);
};
