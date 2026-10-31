export type MemoryFitStatus = 'fits' | 'tight' | 'wont_fit';

/** Fits up to `fitBytes`, tight up to `totalBytes`, won't fit above. */
export const memoryFitStatus = (
  neededBytes: number,
  fitBytes: number,
  totalBytes: number,
): MemoryFitStatus => {
  if (neededBytes <= fitBytes) {
    return 'fits';
  }
  return neededBytes <= totalBytes ? 'tight' : 'wont_fit';
};
