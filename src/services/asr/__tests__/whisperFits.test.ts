import {ASR_IOS_CEILING_SHARE, ASR_TIERS} from '../constants';
import {asrMemoryStatus, memoryBudget, type DeviceMemory} from '../whisperFits';

const base = ASR_TIERS.base.runtimeBytes;

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
    'fits exactly within the budget (%o, chat %d, whisper %d)',
    (memory, chatBytes, whisperBytes) => {
      expect(asrMemoryStatus(memory, chatBytes + whisperBytes) === 'fits').toBe(
        (memory.os === 'ios' && memory.ceilingBytes === 0) ||
          chatBytes + whisperBytes <= memoryBudget(memory),
      );
    },
  );

  it('counts against the RAM share on Android', () => {
    const android = {os: 'android' as const, totalBytes: 8e9};
    expect(asrMemoryStatus(android, 8e9 * 0.45)).toBe('fits');
    expect(asrMemoryStatus(android, 8e9 * 0.45 + 1)).toBe('tight');
  });

  it('counts against a share of pre-load free memory on iOS', () => {
    const ios = {os: 'ios' as const, ceilingBytes: 4e9, totalBytes: 6e9};
    const budget = 4e9 * ASR_IOS_CEILING_SHARE;
    expect(asrMemoryStatus(ios, budget)).toBe('fits');
    expect(asrMemoryStatus(ios, budget + 1)).toBe('tight');
  });
});
