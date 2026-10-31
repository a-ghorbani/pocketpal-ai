import {memoryFitStatus} from '../memoryDisplay';

describe('memoryFitStatus', () => {
  const fit = 4e9;
  const total = 8e9;

  it.each([
    [fit - 1, 'fits'],
    [fit, 'fits'],
    [fit + 1, 'tight'],
    [total, 'tight'],
    [total + 1, 'wont_fit'],
  ] as const)('needs %s bytes → %s', (needed, expected) => {
    expect(memoryFitStatus(needed, fit, total)).toBe(expected);
  });

  it('never refuses when total memory is unknown', () => {
    expect(memoryFitStatus(1e15, fit, Infinity)).toBe('tight');
  });
});
