module.exports = {
  root: true,
  extends: [
    '@react-native',
    // put Prettier last so it can disable conflicting ESLint rules
    'plugin:prettier/recommended',
  ],
  globals: {
    // Compile-time-defined flag (see babel.config.js `transform-define`).
    // Declared as a global so ESLint's no-undef rule doesn't trip.
    __E2E__: 'readonly',
  },
  ignorePatterns: [
    'coverage/',
    'node_modules/',
    'android/',
    'ios/',
    'build/',
    'dist/',
    'e2e/',
  ],
  rules: {
    'prettier/prettier': 'error',
    // Single writer for `agentUiState` is `chatSessionStore.setAgentUiState`;
    // every UI flag derives from it via `@computed`. Ban imperative
    // setters like `setIsGeneratingToolCall` so a regression that
    // reintroduces them is caught at lint time even if TypeScript
    // accepts the new method.
    'no-restricted-syntax': [
      'error',
      {
        selector:
          "CallExpression[callee.property.name='setIsGeneratingToolCall']",
        message:
          'Imperative agent-status setters are banned. Drive agentUiState through agentStateReducer + chatSessionStore.setAgentUiState.',
      },
    ],
  },
  overrides: [
    {
      // Nothing inside src/ (outside src/__automation__/) may import from
      // the automation bridge. The bridge only ships in the E2E flavor and
      // any stray import could drag it into the prod bundle, defeating DCE.
      // The allow-list below re-enables the rule only for App.tsx and the
      // deep-link hook — the two legitimate mount points.
      files: ['src/**/*.{ts,tsx}'],
      excludedFiles: ['src/__automation__/**'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/__automation__', '**/__automation__/**'],
                message:
                  'Do not import from src/__automation__/ outside the automation folder itself. See src/__automation__/README.md.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['App.tsx', 'src/hooks/useDeepLinking.ts'],
      rules: {
        'no-restricted-imports': 'off',
      },
    },
    {
      // The agent runner module is the producer of AgentEvents and
      // does not consume the store; tests for it sometimes need to
      // reach for low-level surfaces. The ban above doesn't fire
      // here anyway (no setIsGeneratingToolCall anywhere in the
      // module), but scope-out for clarity.
      files: ['src/services/agent/**'],
      rules: {
        'no-restricted-syntax': 'off',
      },
    },
  ],
};
