export type CoreVersion = [number, number, number];

const APP_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;
const MIN_APP_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

const toTriple = (match: RegExpMatchArray): CoreVersion => [
  Number(match[1]),
  Number(match[2]),
  Number(match[3]),
];

export const toCoreVersion = (raw: string): CoreVersion | null => {
  const match = raw.match(APP_VERSION_PATTERN);
  return match ? toTriple(match) : null;
};

const compareCore = (a: CoreVersion, b: CoreVersion): number =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

export const passesMinAppVersion = (
  min: unknown,
  appCore: CoreVersion | null,
): boolean => {
  if (min === undefined) {
    return true;
  }
  if (typeof min !== 'string' || appCore === null) {
    return false;
  }
  const match = min.match(MIN_APP_VERSION_PATTERN);
  return match !== null && compareCore(appCore, toTriple(match)) >= 0;
};
