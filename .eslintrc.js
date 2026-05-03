module.exports = {
  root: true,
  extends: [
    '@react-native',
    // put Prettier last so it can disable conflicting ESLint rules
    'plugin:prettier/recommended',
  ],
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
    // Prevent the imperative agent-status setter race that the
    // AssistantTurn refactor (TASK-20260502-2115) eliminated. The
    // single writer of `agentUiState` is `setAgentUiState`; UI flags
    // derive via `@computed`. If a future patch reaches for a
    // deprecated `setIsGeneratingToolCall`-style imperative setter,
    // this rule catches it. `setAgentUiState` itself is allowed.
    'no-restricted-syntax': [
      'error',
      {
        selector:
          "CallExpression[callee.property.name='setIsGeneratingToolCall']",
        message:
          'Imperative agent-status setters are banned (TASK-20260502-2115). Drive agentUiState through agentStateReducer + chatSessionStore.setAgentUiState instead.',
      },
    ],
  },
  overrides: [
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
