const babelConfig = require('../babel.config');

const ENV_KEYS = [
  'BABEL_ENV',
  'NODE_ENV',
  'E2E_BUILD',
  'E2E_SKIP_ONBOARDING',
  'PLUS_STORE_GATE',
];

let saved;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
  ENV_KEYS.forEach(key => delete process.env[key]);
  process.env.BABEL_ENV = 'production';
});

afterEach(() => {
  ENV_KEYS.forEach(key => {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  });
});

function evaluate(env) {
  Object.assign(process.env, env);
  let cacheKey;
  const config = babelConfig({
    cache: {
      using: fn => {
        cacheKey = fn();
        return cacheKey;
      },
    },
  });
  const define = config.plugins.find(
    plugin => Array.isArray(plugin) && plugin[0] === 'transform-define',
  );
  return {cacheKey, defines: define && define[1]};
}

describe('__PLUS_STORE_GATE__', () => {
  it.each([
    [{}, false],
    [{PLUS_STORE_GATE: 'true'}, true],
    [{PLUS_STORE_GATE: '1'}, false],
    [{PLUS_STORE_GATE: 'TRUE'}, false],
    [{PLUS_STORE_GATE: 'yes'}, false],
    [{PLUS_STORE_GATE: 'false'}, false],
    [{E2E_BUILD: 'true'}, true],
    [{E2E_BUILD: 'true', PLUS_STORE_GATE: 'true'}, true],
    [{E2E_BUILD: 'true', PLUS_STORE_GATE: 'false'}, false],
    [{E2E_BUILD: 'true', PLUS_STORE_GATE: '0'}, true],
    [{E2E_BUILD: '1'}, false],
  ])('bundling env %j defines %s', (env, expected) => {
    expect(evaluate(env).defines.__PLUS_STORE_GATE__).toBe(expected);
  });

  it('leaves the other defines unchanged', () => {
    expect(evaluate({PLUS_STORE_GATE: 'true'}).defines).toEqual({
      __E2E__: false,
      __E2E_SKIP_ONBOARDING__: false,
      __PLUS_STORE_GATE__: true,
    });
  });

  it('is part of the babel cache key', () => {
    const ungated = evaluate({}).cacheKey;
    const gated = evaluate({PLUS_STORE_GATE: 'true'}).cacheKey;
    expect(gated).not.toEqual(ungated);
  });

  it('is not defined under jest, which sets the global instead', () => {
    expect(evaluate({BABEL_ENV: 'test'}).defines).toBeUndefined();
  });
});
