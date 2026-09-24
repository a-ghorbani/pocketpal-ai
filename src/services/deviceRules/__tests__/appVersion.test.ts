import {passesMinAppVersion, toCoreVersion} from '../appVersion';

describe('toCoreVersion', () => {
  it.each([
    ['1.17.3', [1, 17, 3]],
    ['1.17.3-rc.1', [1, 17, 3]],
    ['1.17.3+45', [1, 17, 3]],
    ['1.017.0', [1, 17, 0]],
  ])('parses %s', (raw, expected) => {
    expect(toCoreVersion(raw)).toEqual(expected);
  });

  it.each(['unknown', '1.17', '', '1.17.3x', 'v1.17.3', ' 1.17.3'])(
    'treats %p as unknown',
    raw => {
      expect(toCoreVersion(raw)).toBeNull();
    },
  );
});

describe('passesMinAppVersion', () => {
  const app = toCoreVersion('1.17.3');

  it('passes when the key is absent', () => {
    expect(passesMinAppVersion(undefined, app)).toBe(true);
    expect(passesMinAppVersion(undefined, null)).toBe(true);
  });

  it('passes when the app is at or above the minimum', () => {
    expect(passesMinAppVersion('1.17.3', app)).toBe(true);
    expect(passesMinAppVersion('1.16.9', app)).toBe(true);
    expect(passesMinAppVersion('0.99.99', app)).toBe(true);
  });

  it('fails when the app is below the minimum', () => {
    expect(passesMinAppVersion('1.17.4', app)).toBe(false);
    expect(passesMinAppVersion('1.18.0', app)).toBe(false);
    expect(passesMinAppVersion('2.0.0', app)).toBe(false);
  });

  it('compares numerically, not as strings', () => {
    expect(passesMinAppVersion('1.17.9', toCoreVersion('1.17.10'))).toBe(true);
    expect(passesMinAppVersion('1.10.0', toCoreVersion('1.9.0'))).toBe(false);
    expect(passesMinAppVersion('1.017.0', toCoreVersion('1.17.0'))).toBe(true);
    expect(passesMinAppVersion('1.17.0', toCoreVersion('1.017.0'))).toBe(true);
  });

  it('fails every present gate when the app version is unknown', () => {
    expect(passesMinAppVersion('0.0.0', null)).toBe(false);
    expect(passesMinAppVersion('1.0.0', null)).toBe(false);
  });

  it.each([
    ['1.17'],
    ['1.17.3-rc.1'],
    ['1.17.3+45'],
    ['v1.17.3'],
    [' 1.17.3'],
    [''],
    [1.17],
    [null],
    [{}],
  ])('fails a malformed minimum %p', min => {
    expect(passesMinAppVersion(min, app)).toBe(false);
  });
});
