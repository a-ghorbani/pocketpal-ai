module.exports = function (api) {
  const cacheKey = api.cache.using(() => {
    const envName =
      process.env.BABEL_ENV || process.env.NODE_ENV || 'development';
    const isE2E = process.env.E2E_BUILD === 'true';
    // Default ON for E2E builds; the onboarding spec sets
    // E2E_SKIP_ONBOARDING=false so the flow actually mounts.
    const skipOnboarding = isE2E && process.env.E2E_SKIP_ONBOARDING !== 'false';
    return `${envName}:${isE2E}:${skipOnboarding}`;
  });
  const [envName, e2eFlag, skipFlag] = cacheKey.split(':');
  const isTest = envName === 'test';
  const isE2E = e2eFlag === 'true';
  const skipOnboarding = skipFlag === 'true';

  return {
    presets: ['module:@react-native/babel-preset'],
    plugins: [
      ...(!isTest
        ? [
            ['module:react-native-dotenv', {moduleName: '@env'}],
            [
              'transform-define',
              {__E2E__: isE2E, __E2E_SKIP_ONBOARDING__: skipOnboarding},
            ],
          ]
        : []),
      ['@babel/plugin-proposal-decorators', {legacy: true}],
      '@babel/plugin-transform-export-namespace-from', //Zod 4 uses modern JavaScript syntax (export * as) that needs to be transformed by Babel
      // 'react-native-reanimated/plugin', // this is not needed in 4.x
      'react-native-worklets/plugin', // must stay last
    ],
  };
};
