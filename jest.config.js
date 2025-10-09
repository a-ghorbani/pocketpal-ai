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
  coveragePathIgnorePatterns: ['/src/screens/DevToolsScreen/'],
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
    'node_modules/(?!(@supabase|isows|@react-native-google-signin|@flyerhq|@react-native|react-native|uuid|react-native-reanimated|react-native-gesture-handler|react-native-vector-icons|react-native-image-viewing|react-native-parsed-text|@react-navigation/.*|@react-native-masked-view/masked-view|react-native-linear-gradient|react-native-picker-select|react-native-paper|react-native-keyboard-controller|react-native-drawer-layout|marked|react-native-code-highlighter|react-syntax-highlighter|trim-newlines)/)',
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
    'react-native-keychain':
      '<rootDir>/__mocks__/external/react-native-keychain.js',
    '@nozbe/watermelondb':
      '<rootDir>/__mocks__/external/@nozbe/watermelondb.js',
    '@nozbe/watermelondb/adapters/sqlite':
      '<rootDir>/__mocks__/external/@nozbe/watermelondb/adapters/sqlite.js',
    '@nozbe/watermelondb/decorators':
      '<rootDir>/__mocks__/external/@nozbe/watermelondb/decorators.js',
    '@nozbe/watermelondb/Schema':
      '<rootDir>/__mocks__/external/@nozbe/watermelondb/Schema/index.js',
    '@nozbe/watermelondb/Schema/migrations':
      '<rootDir>/__mocks__/external/@nozbe/watermelondb/Schema/migrations.js',
    '@nozbe/watermelondb/QueryDescription':
      '<rootDir>/__mocks__/external/@nozbe/watermelondb/QueryDescription.js',
    '@nozbe/watermelondb/Model':
      '<rootDir>/__mocks__/external/@nozbe/watermelondb/Model.js',
    '@nozbe/simdjson': '<rootDir>/__mocks__/external/@nozbe/simdjson.js',
    '@nozbe/sqlite': '<rootDir>/__mocks__/external/@nozbe/sqlite.js',
    'mobx-persist-store': '<rootDir>/__mocks__/external/mobx-persist-store.js',
    'react-native-image-picker':
      '<rootDir>/__mocks__/external/react-native-image-picker.js',
    'react-native-vision-camera':
      '<rootDir>/__mocks__/external/react-native-vision-camera.ts',
    '@react-native-google-signin/google-signin':
      '<rootDir>/__mocks__/external/@react-native-google-signin/google-signin.ts',
    'react-native-code-highlighter':
      '<rootDir>/__mocks__/external/react-native-code-highlighter.js',
    '@env': '<rootDir>/__mocks__/external/@env.js',
  },
};
