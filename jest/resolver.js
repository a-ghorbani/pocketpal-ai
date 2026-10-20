const reactNativeResolver = require('@react-native/jest-preset/jest/resolver');
const reanimatedResolver = require('react-native-reanimated/jest/resolver');

module.exports = (request, options) =>
  reanimatedResolver(request, {
    ...options,
    defaultResolver: (path, nextOptions) =>
      reactNativeResolver(path, {
        ...nextOptions,
        defaultResolver: options.defaultResolver,
      }),
  });
