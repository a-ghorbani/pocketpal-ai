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
  ],
};
