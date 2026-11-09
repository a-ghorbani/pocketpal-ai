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

const MARKETED_RAM_GIB = [1, 1.5, 2, 3, 4, 6, 8, 10, 12, 16, 18, 20, 24, 32];

export const advertisedRamBytes = (totalBytes: number): number => {
  const gib = totalBytes / 2 ** 30;
  const size = MARKETED_RAM_GIB.find(s => s >= gib) ?? Math.ceil(gib);
  return size * 1e9;
};
