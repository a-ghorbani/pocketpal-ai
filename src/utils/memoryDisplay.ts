export type MemoryFitStatus = 'fits' | 'tight' | 'wont_fit';

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
