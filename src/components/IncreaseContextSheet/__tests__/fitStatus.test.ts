import {hasFittingUpgrade, makeFitStatusFor} from '../fitStatus';

describe('makeFitStatusFor', () => {
  const fit = makeFitStatusFor({
    memBytesFor: nCtx => nCtx, // 1 byte per token keeps the math obvious
    ceiling: 4096,
    totalMemory: 8192,
  });

  it('returns fits at or below the ceiling', () => {
    expect(fit(4096)).toBe('fits');
  });

  it('returns tight between the ceiling and total memory', () => {
    expect(fit(6144)).toBe('tight');
  });

  it('returns wont_fit above total memory', () => {
    expect(fit(9000)).toBe('wont_fit');
  });

  it('collapses the tight zone when total memory is unknown', () => {
    const noTotal = makeFitStatusFor({
      memBytesFor: nCtx => nCtx,
      ceiling: 4096,
      totalMemory: 0,
    });
    expect(noTotal(6144)).toBe('wont_fit');
  });
});

describe('hasFittingUpgrade', () => {
  const ladder = [2048, 4096, 8192, 16384, 32768];
  // Everything fits — isolates the cap/current-size gating from memory.
  const alwaysFits = () => 'fits' as const;

  it('is true when a larger tier within the model cap fits', () => {
    expect(hasFittingUpgrade(ladder, 4096, 32768, alwaysFits)).toBe(true);
  });

  it('is false when the current size already meets the model cap', () => {
    // currentNCtx >= modelMaxCtx: no tier is both > current and <= cap, so the
    // CTA must stay hidden rather than open a sheet whose only stop equals now.
    expect(hasFittingUpgrade(ladder, 8192, 8192, alwaysFits)).toBe(false);
  });

  it('is false when the only larger tiers exceed the model cap', () => {
    expect(hasFittingUpgrade(ladder, 4096, 6000, alwaysFits)).toBe(false);
  });

  it('is false when no larger tier fits the device', () => {
    const noneFit = () => 'wont_fit' as const;
    expect(hasFittingUpgrade(ladder, 4096, 32768, noneFit)).toBe(false);
  });
});
