import {ASR_IOS_CEILING_SHARE, ASR_TIERS} from '../constants';
import {asrMemoryStatus, whisperFits, type DeviceMemory} from '../whisperFits';

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

  it('iOS counts the chat model and whisper against a share of pre-load free memory', () => {
    const ios = {os: 'ios' as const, ceilingBytes: 4e9, totalBytes: 6e9};
    const budget = 4e9 * ASR_IOS_CEILING_SHARE;
    expect(whisperFits(ios, budget - base, base)).toBe(true);
    expect(whisperFits(ios, budget - base + 1, base)).toBe(false);
  });

  it.each([
    ['1.7B', 1.9e9, 'small', true],
    ['4B Q4', 3.2e9, 'base', false],
    ['4B Q4', 3.2e9, 'small', false],
  ] as const)(
    'iOS, 4.2 GB free before any load, chat model %s + %s → fits %s',
    (_name, chatBytes, tier, fits) => {
      expect(
        whisperFits(
          {os: 'ios', ceilingBytes: 4.2e9, totalBytes: 6e9},
          chatBytes,
          ASR_TIERS[tier].runtimeBytes,
        ),
      ).toBe(fits);
    },
  );

  it('iOS fits while pre-load free memory is unknown', () => {
    expect(
      whisperFits({os: 'ios', ceilingBytes: 0, totalBytes: 6e9}, 9e9, base),
    ).toBe(true);
  });
});

describe('asrMemoryStatus', () => {
  const small = ASR_TIERS.small.runtimeBytes;
  const s23 = {os: 'android' as const, totalBytes: 7.4e9};
  const iPhone = (totalBytes: number) => ({
    os: 'ios' as const,
    ceilingBytes: 4.2e9,
    totalBytes,
  });

  it.each([
    ['Gemma 1B + Small', s23, 1.36e9 + small, 'fits'],
    ['Gemma 4B + Small', s23, 3.23e9 + small, 'tight'],
    ['7.2 GB chat + Base', s23, 7.2e9 + base, 'wont_fit'],
    ['4B Q4 + Small', iPhone(6e9), 3.2e9 + small, 'tight'],
    ['4B Q4 + Small, total unreadable', iPhone(Infinity), 3.85e9, 'tight'],
    [
      'unknown ceiling',
      {os: 'ios' as const, ceilingBytes: 0, totalBytes: 1e9},
      9e9,
      'fits',
    ],
  ] as const)('%s → %s', (_name, memory, neededBytes, expected) => {
    expect(asrMemoryStatus(memory, neededBytes)).toBe(expected);
  });

  const memories: DeviceMemory[] = [
    {os: 'android', totalBytes: 4e9},
    {os: 'android', totalBytes: 7.4e9},
    {os: 'android', totalBytes: 15.8e9},
    {os: 'ios', ceilingBytes: 0, totalBytes: 6e9},
    {os: 'ios', ceilingBytes: 4.2e9, totalBytes: 6e9},
    {os: 'ios', ceilingBytes: 4.2e9, totalBytes: Infinity},
  ];
  const chats = [0, 1.36e9, 3.23e9, 3.36e9 - base, 8e9];
  const grid = memories.flatMap(memory =>
    chats.flatMap(chat =>
      [base, small].map(tier => [memory, chat, tier] as const),
    ),
  );

  it.each(grid)(
    'fits exactly where whisper fitted before (%o, chat %d, whisper %d)',
    (memory, chatBytes, whisperBytes) => {
      expect(asrMemoryStatus(memory, chatBytes + whisperBytes) === 'fits').toBe(
        whisperFits(memory, chatBytes, whisperBytes),
      );
    },
  );
});
