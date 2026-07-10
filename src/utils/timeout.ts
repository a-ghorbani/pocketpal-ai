/** Parse a seconds field into whole ms; empty/invalid/non-positive → undefined. */
export function parseTimeoutMs(seconds: string): number | undefined {
  const value = parseFloat(seconds.trim());
  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.round(value * 1000);
}
