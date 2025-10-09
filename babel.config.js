module.exports = function (api) {
  const isTest = api.env('test'); // do NOT call api.cache(true) together with api.env

  return {
    presets: ['module:@react-native/babel-preset'],
    plugins: [
      !isTest && ['module:react-native-dotenv', {moduleName: '@env'}],
      ['@babel/plugin-proposal-decorators', {legacy: true}],
      'react-native-reanimated/plugin', // must stay last
    ].filter(Boolean),
  };
};
