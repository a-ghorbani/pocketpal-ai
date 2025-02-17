module.exports = {
  preset: 'react-native',
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!**/index.{ts,tsx}',
    '!**/styles.{ts,tsx}',
    '!**/types.{ts,tsx}',
    '!**/*.d.ts',
    '!**/ImageView.android.ts',
    '!**/ImageView.ios.ts',
    '!**/ImageView.tsx',
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  setupFiles: ['./jest/setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(@flyerhq|@react-native|react-native|uuid|react-native-reanimated|react-native-gesture-handler|react-native-vector-icons|react-native-image-viewing|react-native-parsed-text|@react-navigation/.*|@react-native-masked-view/masked-view|react-native-linear-gradient|react-native-picker-select|react-native-paper|react-native-keyboard-controller)/)',
  ],
  testMatch: [
    '**/__tests__/**/*.test.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],
  moduleNameMapper: {
    '@react-native-async-storage/async-storage':
      '<rootDir>/__mocks__/external/@react-native-async-storage/async-storage.js',
    '@pocketpalai/llama.rn': '<rootDir>/__mocks__/external/llama.rn.ts',
    'react-dom': '<rootDir>/__mocks__/external/react-dom.js',
    'react-native-device-info':
      '<rootDir>/__mocks__/external/react-native-device-info.js',
    'react-native-document-picker':
      '<rootDir>/__mocks__/external/react-native-document-picker.js',
    '@dr.pogodin/react-native-fs':
      '<rootDir>/__mocks__/external/@dr.pogodin/react-native-fs.js',
    'react-native-haptic-feedback':
      '<rootDir>/__mocks__/external/react-native-haptic-feedback.js',
    '@react-native-firebase/app':
      '<rootDir>/__mocks__/external/@react-native-firebase/app.js',
    '@react-native-firebase/app-check':
      '<rootDir>/__mocks__/external/@react-native-firebase/app-check.js',
    '\\.svg': '<rootDir>/__mocks__/external/react-native-svg.js',
    '@kesha-antonov/react-native-background-downloader':
      '<rootDir>/__mocks__/external/@kesha-antonov/react-native-background-downloader.js',
  },
};
