// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const persistenceInternals = [
  '../db/index',
  '../../db/index',
  '../../../db/index',
  '../db/repositories/*',
  '../../db/repositories/*',
  '../../../db/repositories/*',
];

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    files: [
      'src/screens/**/*.{ts,tsx}',
      'src/theme/**/*.{ts,tsx}',
      'src/sync/**/*.{ts,tsx}',
    ],
    ignores: ['src/**/__tests__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: persistenceInternals,
              message: 'Use db/mobileStore or an application use case outside the persistence layer.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/db/repositories/**/*.ts'],
    ignores: ['src/db/repositories/**/__tests__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../index', '../../db/index'],
              message: 'Repositories must use their injected DatabaseExecutor.',
            },
          ],
        },
      ],
    },
  },
]);
