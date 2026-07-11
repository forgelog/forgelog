module.exports = {
  preset: 'jest-expo',
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/__tests__/**',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/test-utils/**',
  ],
  coverageReporters: ['text', 'lcov', 'json-summary'],
};
