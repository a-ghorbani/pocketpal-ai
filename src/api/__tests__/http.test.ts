import {fetchWithTimeout} from '../http';

function pendingFetch() {
  return jest.fn().mockImplementation(
    (_url: string, init: {signal: AbortSignal}) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }),
  );
}

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('rejects "Connection timed out" when the timer fires first', async () => {
    global.fetch = pendingFetch();

    const promise = fetchWithTimeout('http://h/x', {}, {timeoutMs: 5000});
    jest.advanceTimersByTime(5000);

    await expect(promise).rejects.toThrow('Connection timed out');
  });

  it('rejects as an abort, not a timeout, when the caller aborts', async () => {
    global.fetch = pendingFetch();
    const caller = new AbortController();

    const promise = fetchWithTimeout(
      'http://h/x',
      {},
      {timeoutMs: 5000, signal: caller.signal},
    );
    caller.abort();

    const error = await promise.catch(e => e);
    expect(error.name).toBe('AbortError');
    expect(error.message).not.toBe('Connection timed out');
  });

  it('leaves no timer behind once the response arrives', async () => {
    const response = {ok: true, status: 200};
    global.fetch = jest.fn().mockResolvedValue(response);

    await expect(
      fetchWithTimeout('http://h/x', {method: 'GET'}, {timeoutMs: 5000}),
    ).resolves.toBe(response);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('rejects without calling fetch when the caller signal is already aborted', async () => {
    global.fetch = jest.fn();
    const caller = new AbortController();
    caller.abort();

    const error = await fetchWithTimeout(
      'http://h/x',
      {},
      {timeoutMs: 5000, signal: caller.signal},
    ).catch(e => e);

    expect(error.name).toBe('AbortError');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('passes the request through with its own linked signal', async () => {
    global.fetch = jest.fn().mockResolvedValue({ok: true});

    await fetchWithTimeout(
      'http://h/x',
      {method: 'POST', body: '{}'},
      {timeoutMs: 5000},
    );

    expect(global.fetch).toHaveBeenCalledWith('http://h/x', {
      method: 'POST',
      body: '{}',
      signal: expect.any(Object),
    });
  });
});
