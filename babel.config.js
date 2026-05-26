module.exports = function (api) {
  const cacheKey = api.cache.using(() => {
    const envName =
      process.env.BABEL_ENV || process.env.NODE_ENV || 'development';
    const isE2E = process.env.E2E_BUILD === 'true';
    return `${envName}:${isE2E}`;
  });
  const [envName, e2eFlag] = cacheKey.split(':');
  const isTest = envName === 'test';
  const isE2E = e2eFlag === 'true';

  return {
    presets: ['module:@react-native/babel-preset'],
    plugins: [
      ...(!isTest
        ? [
            ['module:react-native-dotenv', {moduleName: '@env'}],
            ['transform-define', {__E2E__: isE2E}],
          ]
        : []),
      ['@babel/plugin-proposal-decorators', {legacy: true}],
      '@babel/plugin-transform-export-namespace-from', //Zod 4 uses modern JavaScript syntax (export * as) that needs to be transformed by Babel
      // 'react-native-reanimated/plugin', // this is not needed in 4.x
      'react-native-worklets/plugin', // must stay last
    ],
  };
};
