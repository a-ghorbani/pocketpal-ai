module.exports = function (api) {
  const isTest = api.env('test'); // do NOT call api.cache(true) together with api.env

  return {
    presets: ['module:@react-native/babel-preset'],
    plugins: [
      !isTest && ['module:react-native-dotenv', {moduleName: '@env'}],
      ['@babel/plugin-proposal-decorators', {legacy: true}],
      '@babel/plugin-transform-export-namespace-from', //Zod 4 uses modern JavaScript syntax (export * as) that needs to be transformed by Babel
      // 'react-native-reanimated/plugin', // this is not needed in 4.x
      'react-native-worklets/plugin', // must stay last
    ].filter(Boolean),
  };
};
