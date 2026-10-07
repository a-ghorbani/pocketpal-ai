interface AbortableFetchOptions {
  onCall?: (init: {signal: AbortSignal}, url: string) => void;
  body?: string;
}

const abortError = (): Error => {
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
};

export const okResponse = (body: string) =>
  ({
    ok: true,
    status: 200,
    headers: {get: () => null},
    text: () => Promise.resolve(body),
  }) as unknown as Response;

/**
 * A fetch mock that honours `init.signal` like RN's fetch: an already-aborted
 * signal rejects at once, a later abort rejects the pending call. Without
 * `body` the call stays pending until aborted.
 */
export const abortableFetch = ({onCall, body}: AbortableFetchOptions = {}) =>
  jest.fn<Promise<Response>, Parameters<typeof fetch>>(
    (input, init) =>
      new Promise((resolve, reject) => {
        const signal = init?.signal as AbortSignal;
        if (signal.aborted) {
          reject(abortError());
          return;
        }
        signal.addEventListener('abort', () => reject(abortError()));
        onCall?.({signal}, String(input));
        if (body !== undefined) {
          resolve(okResponse(body));
        }
      }),
  );
