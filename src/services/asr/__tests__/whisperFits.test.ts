import {ASR_TIERS} from '../constants';
import {whisperFits} from '../whisperFits';

const base = ASR_TIERS.base.runtimeBytes;

describe('whisperFits', () => {
  it.each([
    [3.23e9, false],
    [1.4e9, true],
  ])('Android 7.4 GB, chat model %s bytes → fits %s', (chatBytes, expected) => {
    expect(
      whisperFits({os: 'android', totalBytes: 7.4e9}, chatBytes, base),
    ).toBe(expected);
  });

  it('Android counts the chat model and whisper against the RAM share', () => {
    const total = 8e9;
    const budget = total * 0.45;
    expect(
      whisperFits({os: 'android', totalBytes: total}, budget - base, base),
    ).toBe(true);
    expect(
      whisperFits({os: 'android', totalBytes: total}, budget - base + 1, base),
    ).toBe(false);
  });

  it('iOS counts the chat model and whisper against pre-load free memory', () => {
    const ios = {os: 'ios' as const, ceilingBytes: 4e9};
    expect(whisperFits(ios, 4e9 - base, base)).toBe(true);
    expect(whisperFits(ios, 4e9 - base + 1, base)).toBe(false);
  });

  it('iOS fits while pre-load free memory is unknown', () => {
    expect(whisperFits({os: 'ios', ceilingBytes: 0}, 9e9, base)).toBe(true);
  });
});
