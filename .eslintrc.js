module.exports = {
  root: true,
  extends: ['@react-native'],
  plugins: [
    'react',
    'react-hooks',
    'react-native',
    'eslint-comments',
    '@typescript-eslint',
    'jest',
  ],
  ignorePatterns: ['coverage/'],
  rules: {
    // Re-enable formatting rules that were disabled by eslint-config-prettier
    // This is needed after upgrading to rn 0.79.6
    indent: [
      'error',
      2,
      {
        SwitchCase: 1,
        flatTernaryExpressions: false,
        offsetTernaryExpressions: true,
      },
    ],
    'no-trailing-spaces': 'error',
    'no-multiple-empty-lines': ['error', {max: 2}],
    'eol-last': ['error', 'always'],
    // 'comma-dangle': ['error', 'always'],
    'object-curly-spacing': ['error', 'never'],
    'array-bracket-spacing': ['error', 'never'],
    'space-infix-ops': 'error',
    'space-before-blocks': 'error',
    'keyword-spacing': ['error', {before: true, after: true}],
    semi: ['error', 'always'],

    // React / JSX rules
    'react/no-string-refs': 'warn',
    'react/prop-types': 'off',
    'react/react-in-jsx-scope': 'warn',

    // Arrow / callback preferences (as before)
    'arrow-body-style': 'off',
    'prefer-arrow-callback': 'off',
  },
};
