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
      //
      // The same rule also seeds the Paper-import discipline blocklist:
      // Paper symbols whose DS replacement has shipped get banned
      // per-symbol as call-sites migrate.
      //
      // Wrap-Paper DS components (Switch/Checkbox/RadioButton) keep
      // importing their Paper counterpart and are excluded below.
      files: ['src/**/*.{ts,tsx}'],
      excludedFiles: [
        'src/__automation__/**',
        'src/components/ui/Switch/**',
        'src/components/ui/Checkbox/**',
        'src/components/ui/RadioButton/**',
      ],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: 'react-native-paper',
                importNames: ['Surface'],
                message:
                  "DS replacement available: import 'Surface' from 'src/components/ui' instead. Locked thin Paper set: Text, Button, IconButton, Portal, Provider.",
              },
            ],
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
      // Mechanical guard against raw hex literals in any DS family's
      // styles.ts. Tokens-only contract: every color flows through
      // theme.colors.* (or theme.interaction.*). Scoped intentionally
      // narrow — DS test fixtures may still need literal hex; component
      // .tsx files don't have inline styles.
      files: ['src/components/ui/**/styles.ts'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: 'Literal[value=/^#[0-9a-fA-F]{3,8}$/]',
            message:
              'Raw hex literal in DS styles.ts is banned — read the color through theme.colors.* (or theme.interaction.*) instead. If the value genuinely cannot come from a token, surface it as a token-layer gap, not a styles.ts string.',
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
