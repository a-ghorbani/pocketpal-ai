// Single writer for `agentUiState` is `chatSessionStore.setAgentUiState`;
// every UI flag derives from it via `@computed`. Ban imperative
// setters like `setIsGeneratingToolCall` so a regression that
// reintroduces them is caught at lint time even if TypeScript
// accepts the new method.
const AGENT_SETTER = {
  selector: "CallExpression[callee.property.name='setIsGeneratingToolCall']",
  message:
    'Imperative agent-status setters are banned. Drive agentUiState through agentStateReducer + chatSessionStore.setAgentUiState.',
};

// A server type is a capability question, and the answer lives in one place:
// the server profile. Comparing the persisted string at a call site is how
// two gates for the same capability come to disagree. Matches both operand orders, loose
// `==`, and `case` labels; misses object keys and the union's own members.
const SERVER_TYPE_LITERAL = [
  {
    selector:
      'BinaryExpression[operator=/^[!=]==?$/] > Literal[value=/^(llama\\.cpp|LM Studio|Ollama|OpenAI|vLLM)$/]',
    message:
      'Do not compare a server type to a literal. Ask the server profile: profileFor(type).hasProps or another profile member (src/api/servers/).',
  },
  {
    selector:
      'SwitchCase > Literal.test[value=/^(llama\\.cpp|LM Studio|Ollama|OpenAI|vLLM)$/]',
    message:
      'Do not switch on a server-type literal. Give the behaviour to the server profile (src/api/servers/).',
  },
];

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
    __E2E_SKIP_ONBOARDING__: 'readonly',
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
    'no-restricted-syntax': ['error', AGENT_SETTER, ...SERVER_TYPE_LITERAL],
  },
  overrides: [
    {
      // Build/CI tooling: Node CommonJS, not React Native.
      files: ['scripts/**/*.js'],
      env: {node: true, es2021: true},
    },
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
      // No per-folder Paper carve-out is wired yet because the blocklist
      // only contains 'Surface', and none of the wrap-Paper DS folders
      // (Switch/Checkbox/RadioButton/Dropdown) import Surface. Each
      // future blocklist entry that overlaps a wrap-Paper folder gets
      // its own allowance in lock-step with the addition.
      files: ['src/**/*.{ts,tsx}'],
      excludedFiles: ['src/__automation__/**'],
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
        // An override replaces the base selector list rather than merging
        // with it, so every list that exists has to carry the shared bans.
        'no-restricted-syntax': [
          'error',
          {
            selector: 'Literal[value=/^#[0-9a-fA-F]{3,8}$/]',
            message:
              'Raw hex literal in DS styles.ts is banned — read the color through theme.colors.* (or theme.interaction.*) instead. If the value genuinely cannot come from a token, surface it as a token-layer gap, not a styles.ts string.',
          },
          ...SERVER_TYPE_LITERAL,
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
      // An override never inherits the base list, so this one names the shared
      // bans explicitly rather than switching the rule off: an `off` here is
      // how the next ban would silently skip this folder.
      files: ['src/services/agent/**'],
      rules: {
        'no-restricted-syntax': ['error', AGENT_SETTER, ...SERVER_TYPE_LITERAL],
      },
    },
    {
      // Where a server-type literal is the value rather than a proxy for a
      // capability: the detector that reads the type off a response, and tests
      // and mocks that have to name the type they are exercising. The profile
      // table is not here — it uses the literals as object keys, which the ban
      // does not match anyway, so a comparison sneaking into it still fails.
      // Last in `overrides`, so it also wins for
      // src/services/agent/__tests__/.
      files: ['src/api/servers/detect.ts', '**/__tests__/**', '__mocks__/**'],
      rules: {
        'no-restricted-syntax': ['error', AGENT_SETTER],
      },
    },
  ],
};
