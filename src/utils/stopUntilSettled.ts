/**
 * Turns an abort into a level-triggered stop: from the first abort until
 * `pending` settles, `stop` runs at once and then every `intervalMs`.
 *
 * A single stop can be lost. llama.rn's `completion` awaits chat formatting
 * before its native call starts, and that call clears the native interrupt
 * flag, so a stop sent in between does nothing. Repeating it until the call
 * settles closes that window.
 *
 * Resolves when `pending` settles; never rejects.
 */
export function stopUntilSettled(
  pending: Promise<unknown>,
  signal: AbortSignal,
  stop: () => Promise<void> | void,
  intervalMs = 100,
): Promise<void> {
  return new Promise(resolve => {
    let settled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const callStop = () => {
      try {
        Promise.resolve(stop()).catch(err => {
          console.warn('[stopUntilSettled] stop failed:', err);
        });
      } catch (err) {
        console.warn('[stopUntilSettled] stop failed:', err);
      }
    };

    const onAbort = () => {
      if (settled || timer) {
        return;
      }
      callStop();
      timer = setInterval(callStop, intervalMs);
    };

    const onSettled = () => {
      settled = true;
      if (timer) {
        clearInterval(timer);
      }
      signal.removeEventListener('abort', onAbort);
      resolve();
    };

    pending.then(onSettled, onSettled);
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener('abort', onAbort);
    }
  });
}
