const warn = (err: unknown) => console.warn('[stop] failed:', err);

export function stopQuietly(stop: () => unknown): void {
  try {
    Promise.resolve(stop()).catch(warn);
  } catch (err) {
    warn(err);
  }
}
