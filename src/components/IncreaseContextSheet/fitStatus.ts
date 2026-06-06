export type FitStatus = 'fits' | 'tight' | 'wont_fit';

interface FitStatusDeps {
  // Memory required to load the model at a candidate n_ctx, via the same
  // estimator the load path uses.
  memBytesFor: (nCtx: number) => number;
  // Calibrated ceiling below which a load is considered safe.
  ceiling: number;
  // Total device RAM; 0 collapses the "tight" zone to fits-or-won't.
  totalMemory: number;
}

// Pure, store-free three-zone fit classifier. Caller injects the estimator and
// the memory bounds so this stays free of MobX / device dependencies.
export const makeFitStatusFor =
  ({memBytesFor, ceiling, totalMemory}: FitStatusDeps) =>
  (nCtx: number): FitStatus => {
    const req = memBytesFor(nCtx);
    if (req <= ceiling) {
      return 'fits';
    }
    if (totalMemory > 0 && req <= totalMemory) {
      return 'tight';
    }
    return 'wont_fit';
  };

// Gate for the banner's increase CTA: true iff at least one ladder tier above
// the current size, within the model's trained cap, fits the device. Mirrors
// the sheet's ladder filter so the CTA never opens a sheet with no real stop.
export const hasFittingUpgrade = (
  ladder: readonly number[],
  currentNCtx: number,
  modelMaxCtx: number,
  fitStatusFor: (nCtx: number) => FitStatus,
): boolean =>
  ladder.some(
    tier =>
      tier > currentNCtx &&
      tier <= modelMaxCtx &&
      fitStatusFor(tier) === 'fits',
  );
