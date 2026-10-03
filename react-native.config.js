const centralizedIntegrationsEnabled =
  process.env.ENABLE_PALSHUB_INTEGRATION === 'true';

const disabledNativeDependency = centralizedIntegrationsEnabled
  ? {}
  : {platforms: {android: null, ios: null}};

module.exports = {
  project: {
    ios: {},
    android: {},
  },
  assets: ['./src/assets/fonts'],
  dependencies: {
    '@react-native-firebase/app': disabledNativeDependency,
    '@react-native-firebase/app-check': disabledNativeDependency,
    '@react-native-google-signin/google-signin': disabledNativeDependency,
  },
};
