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
};
