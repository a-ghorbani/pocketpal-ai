const configureBabel = require('../babel.config');

const configFor = env => {
  const previous = {
    BABEL_ENV: process.env.BABEL_ENV,
    NODE_ENV: process.env.NODE_ENV,
    E2E_BUILD: process.env.E2E_BUILD,
    E2E_SKIP_ONBOARDING: process.env.E2E_SKIP_ONBOARDING,
    ENABLE_PALSHUB_INTEGRATION: process.env.ENABLE_PALSHUB_INTEGRATION,
  };
  Object.assign(process.env, env);
  for (const key of Object.keys(previous)) {
    if (!(key in env)) {
      delete process.env[key];
    }
  }

  try {
    return configureBabel({
      cache: {using: callback => callback()},
    });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

const transformDefinitions = config =>
  config.plugins.find(plugin => plugin[0] === 'transform-define')[1];

describe('Babel build constants', () => {
  it('leaves E2E flags runtime-overridable in Jest while selecting the enabled integration lane', () => {
    const config = configFor({BABEL_ENV: 'test'});

    expect(transformDefinitions(config)).toEqual({
      __ENABLE_PALSHUB__: true,
    });
    expect(config.plugins).not.toContainEqual([
      'module:react-native-dotenv',
      {moduleName: '@env'},
    ]);
  });

  it('selects the disabled integration lane explicitly in Jest', () => {
    expect(
      transformDefinitions(
        configFor({
          BABEL_ENV: 'test',
          ENABLE_PALSHUB_INTEGRATION: 'false',
        }),
      ),
    ).toEqual({__ENABLE_PALSHUB__: false});
  });

  it('inlines production E2E and integration flags outside Jest', () => {
    const config = configFor({
      NODE_ENV: 'production',
      E2E_BUILD: 'true',
      E2E_SKIP_ONBOARDING: 'false',
      ENABLE_PALSHUB_INTEGRATION: 'false',
    });

    expect(transformDefinitions(config)).toEqual({
      __E2E__: true,
      __E2E_SKIP_ONBOARDING__: false,
      __ENABLE_PALSHUB__: false,
    });
    expect(config.plugins).toContainEqual([
      'module:react-native-dotenv',
      {moduleName: '@env'},
    ]);
  });
});
