import {getRulesUrl} from '../rulesUrls';

describe('getRulesUrl', () => {
  it.each([
    [
      'android',
      'https://cdn.jsdelivr.net/gh/a-ghorbani/pocketpal-device-rules@main/rules.android.v2.json',
    ],
    [
      'ios',
      'https://cdn.jsdelivr.net/gh/a-ghorbani/pocketpal-device-rules@main/rules.ios.v2.json',
    ],
  ] as const)('points %s at the v2 rules file', (platform, url) => {
    expect(getRulesUrl(platform)).toBe(url);
  });
});
