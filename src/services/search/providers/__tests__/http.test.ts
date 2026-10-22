import {abortableFetch} from '../../../../../jest/abortableFetch';

import {fetchText, fetchJson, requireKey} from '../http';

const headers = (entries: Record<string, string>) => ({
  get: (name: string) => entries[name.toLowerCase()] ?? null,
});

describe('requireKey', () => {
  it('throws a clear "<provider> key not set" when the key is empty', () => {
    expect(() => requireKey('', 'Tavily')).toThrow(/Tavily key not set/);
    expect(() => requireKey('  ', 'Tavily')).toThrow(/key not set/);
  });

  it('returns the trimmed key when present', () => {
    expect(requireKey('  abc ', 'Brave')).toBe('abc');
  });
});

describe('response body cap', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('rejects a declared over-cap body before buffering (fetchText)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      headers: headers({'content-length': String(5 * 1024 * 1024)}),
      text: jest.fn(),
    });
    await expect(
      fetchText('https://r.jina.ai/x', {method: 'GET'}),
    ).rejects.toThrow(/too large/i);
  });

  it('rejects a declared over-cap body before buffering (fetchJson)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      headers: headers({'content-length': String(5 * 1024 * 1024)}),
      json: jest.fn(),
    });
    await expect(
      fetchJson('https://api.example.com/s', {method: 'GET'}),
    ).rejects.toThrow(/too large/i);
  });

  it('clamps an unsized over-cap text body to the byte cap', async () => {
    const huge = 'x'.repeat(3 * 1024 * 1024);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      headers: headers({}),
      text: () => Promise.resolve(huge),
    });
    const out = await fetchText('https://r.jina.ai/x', {method: 'GET'});
    expect(out.length).toBe(2 * 1024 * 1024);
  });

  it('passes a within-cap body through unchanged', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      headers: headers({'content-length': '11'}),
      text: () => Promise.resolve('short body!'),
    });
    expect(await fetchText('https://r.jina.ai/x', {method: 'GET'})).toBe(
      'short body!',
    );
  });

  it('rejects an unsized over-cap JSON body before parsing (fetchJson)', async () => {
    const huge = JSON.stringify({data: 'x'.repeat(3 * 1024 * 1024)});
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      headers: headers({}),
      text: () => Promise.resolve(huge),
    });
    await expect(
      fetchJson('https://api.example.com/s', {method: 'GET'}),
    ).rejects.toThrow(/too large/i);
  });

  it('parses a within-cap JSON body via the bounded text path', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      headers: headers({}),
      text: () => Promise.resolve(JSON.stringify({a: 1})),
    });
    expect(
      await fetchJson<{a: number}>('https://api.example.com/s', {
        method: 'GET',
      }),
    ).toEqual({a: 1});
  });
});

describe('caller signal', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects "cancelled" without fetching when the caller signal is already aborted', async () => {
    global.fetch = abortableFetch();
    const caller = new AbortController();
    caller.abort();

    await expect(
      fetchText('https://r.jina.ai/x', {method: 'GET', signal: caller.signal}),
    ).rejects.toThrow('cancelled');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects "cancelled" once when the caller aborts mid-request, and clears the timer', async () => {
    const caller = new AbortController();
    global.fetch = abortableFetch({onCall: () => caller.abort()});

    const settled = jest.fn();
    const call = fetchJson('https://api.example.com/s', {
      method: 'POST',
      signal: caller.signal,
    });
    call.catch(settled);
    await expect(call).rejects.toThrow('cancelled');

    jest.advanceTimersByTime(13000);
    await Promise.resolve();
    expect(settled).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('rejects "timed out" when the timer fires first, and a later abort changes nothing', async () => {
    global.fetch = abortableFetch();
    const caller = new AbortController();

    const settled = jest.fn();
    const call = fetchText('https://r.jina.ai/x', {
      method: 'GET',
      signal: caller.signal,
    });
    call.catch(settled);
    jest.advanceTimersByTime(12000);
    await expect(call).rejects.toThrow('timed out');

    caller.abort();
    await Promise.resolve();
    expect(settled).toHaveBeenCalledTimes(1);
    expect(settled.mock.calls[0][0].message).toBe('timed out');
  });

  it('keeps the first source when the timer and an abort land in the same tick', async () => {
    global.fetch = abortableFetch();
    const caller = new AbortController();

    const call = fetchText('https://r.jina.ai/x', {
      method: 'GET',
      signal: caller.signal,
    });
    jest.advanceTimersByTime(12000);
    caller.abort();

    await expect(call).rejects.toThrow('timed out');
  });

  it('leaves no listener on the caller signal and no timer after successful calls', async () => {
    global.fetch = abortableFetch({body: '{"a":1}'});
    const caller = new AbortController();
    const add = jest.spyOn(caller.signal, 'addEventListener');
    const remove = jest.spyOn(caller.signal, 'removeEventListener');

    for (let i = 0; i < 3; i++) {
      await fetchJson('https://api.example.com/s', {
        method: 'GET',
        signal: caller.signal,
      });
    }

    expect(add).toHaveBeenCalledTimes(3);
    expect(remove).toHaveBeenCalledTimes(3);
    add.mock.calls.forEach(([type, handler], i) => {
      expect(remove.mock.calls[i]).toEqual([type, handler]);
    });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('hands fetch its own signal and never aborts the caller signal', async () => {
    global.fetch = abortableFetch({body: 'ok'});
    const caller = new AbortController();

    await fetchText('https://r.jina.ai/x', {
      method: 'GET',
      signal: caller.signal,
    });

    const passed = (global.fetch as jest.Mock).mock.calls[0][1].signal;
    expect(passed).not.toBe(caller.signal);
    expect(caller.signal.aborted).toBe(false);
  });
});

describe('429 retry', () => {
  const url = 'https://api.example.com/s';
  const response = (status: number, entries: Record<string, string> = {}) =>
    ({
      ok: status >= 200 && status < 300,
      status,
      headers: headers(entries),
      text: () => Promise.resolve('{"a":1}'),
    }) as unknown as Response;
  const fetchReturning = (...responses: Response[]) => {
    const mock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
    responses.forEach(r => mock.mockResolvedValueOnce(r));
    global.fetch = mock;
    return mock;
  };
  const outcome = (call: Promise<unknown>) =>
    call.then(
      () => 'resolved',
      (e: Error) => e.message,
    );
  const searchRequest = (signal?: AbortSignal) =>
    fetchJson(url, {method: 'GET', signal}, {retryOn429: true});

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('is off by default', async () => {
    const mock = fetchReturning(response(429), response(200));

    const result = outcome(fetchJson(url, {method: 'GET'}));
    await jest.advanceTimersByTimeAsync(5000);

    expect(await result).toBe('request failed (429)');
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('retries once after Retry-After and leaves no listener or timer behind', async () => {
    const mock = fetchReturning(
      response(429, {'retry-after': '1'}),
      response(200),
    );
    const caller = new AbortController();
    const add = jest.spyOn(caller.signal, 'addEventListener');
    const remove = jest.spyOn(caller.signal, 'removeEventListener');

    const result = searchRequest(caller.signal);
    await jest.advanceTimersByTimeAsync(999);
    expect(mock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(mock).toHaveBeenCalledTimes(2);

    expect(await result).toEqual({a: 1});
    expect(add).toHaveBeenCalledTimes(3);
    expect(remove).toHaveBeenCalledTimes(3);
    add.mock.calls.forEach(([type, handler], i) => {
      expect(remove.mock.calls[i]).toEqual([type, handler]);
    });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('returns the original error when the retry also gets 429', async () => {
    const mock = fetchReturning(response(429), response(429));

    const result = outcome(searchRequest());
    await jest.advanceTimersByTimeAsync(999);
    expect(mock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);

    expect(await result).toBe('request failed (429)');
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('cancels the wait on abort and never sends the retry', async () => {
    const mock = fetchReturning(
      response(429, {'x-ratelimit-reset': '1'}),
      response(200),
    );
    const caller = new AbortController();

    const result = outcome(searchRequest(caller.signal));
    await jest.advanceTimersByTimeAsync(500);
    caller.abort();
    expect(jest.getTimerCount()).toBe(0);

    expect(await result).toBe('cancelled');
    await jest.advanceTimersByTimeAsync(5000);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Retry-After: 30', {'retry-after': '30'}],
    ['X-RateLimit-Reset: 5', {'x-ratelimit-reset': '5'}],
    ['an epoch-style reset', {'x-ratelimit-reset': '1767225600'}],
  ])(
    'fails at once without a retry when the hint is over 2 s (%s)',
    async (_label, entries) => {
      const mock = fetchReturning(response(429, entries), response(200));

      expect(await outcome(searchRequest())).toBe('request failed (429)');
      expect(mock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    [
      'an HTTP-date 1 s ahead',
      {'retry-after': 'Thu, 01 Jan 2026 00:00:01 GMT'},
      1000,
    ],
    [
      'a past HTTP-date',
      {'retry-after': 'Wed, 31 Dec 2025 23:59:00 GMT'},
      1000,
    ],
    ['an unparseable Retry-After', {'retry-after': 'soon'}, 1000],
    ['a negative reset', {'x-ratelimit-reset': '-1'}, 1000],
    [
      'Retry-After over a reset header',
      {'retry-after': '2', 'x-ratelimit-reset': '1'},
      2000,
    ],
    [
      'X-RateLimit-Reset over RateLimit-Reset',
      {'x-ratelimit-reset': '1', 'ratelimit-reset': '5'},
      1000,
    ],
    ['RateLimit-Reset alone', {'ratelimit-reset': '2'}, 2000],
    [
      'the smallest value of a reset list',
      {'x-ratelimit-reset': '1, 1419704'},
      1000,
    ],
    [
      'a reset list whose smaller value comes second',
      {'x-ratelimit-reset': '5, 1'},
      1000,
    ],
  ])(
    'retries after the hinted wait for %s',
    async (_label, entries, waitMs) => {
      const mock = fetchReturning(response(429, entries), response(200));

      const result = outcome(searchRequest());
      await jest.advanceTimersByTimeAsync(waitMs - 1);
      expect(mock).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);

      expect(mock).toHaveBeenCalledTimes(2);
      expect(await result).toBe('resolved');
    },
  );

  it.each([500, 503])('does not retry a %i', async status => {
    const mock = fetchReturning(response(status), response(200));

    expect(await outcome(searchRequest())).toBe(`request failed (${status})`);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('sends no retry when Stop lands as the 429 arrives', async () => {
    const caller = new AbortController();
    const mock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
    mock
      .mockImplementationOnce(async () => {
        caller.abort();
        return response(429, {'retry-after': '1'});
      })
      .mockResolvedValueOnce(response(200));
    global.fetch = mock;

    expect(await outcome(searchRequest(caller.signal))).toBe('cancelled');
    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(5000);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a network error', async () => {
    const mock = jest
      .fn<Promise<Response>, Parameters<typeof fetch>>()
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(response(200));
    global.fetch = mock;

    const result = outcome(searchRequest());
    await jest.advanceTimersByTimeAsync(5000);

    expect(await result).toBe('Network request failed');
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a timeout', async () => {
    global.fetch = abortableFetch();

    const result = outcome(
      fetchJson(url, {method: 'GET'}, {timeoutMs: 100, retryOn429: true}),
    );
    await jest.advanceTimersByTimeAsync(5000);

    expect(await result).toBe('timed out');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns the retry error when the retry fails another way', async () => {
    const mock = fetchReturning(response(429), response(500));

    const result = outcome(searchRequest());
    await jest.advanceTimersByTimeAsync(1000);

    expect(await result).toBe('request failed (500)');
    expect(mock).toHaveBeenCalledTimes(2);
  });
});

describe('cookies', () => {
  it('omits credentials on fetchJson requests', async () => {
    global.fetch = abortableFetch({body: '{"a":1}'});

    await fetchJson('https://api.you.com/v1/search', {method: 'GET'});

    expect((global.fetch as jest.Mock).mock.calls[0][1].credentials).toBe(
      'omit',
    );
  });

  it('omits credentials on fetchText requests', async () => {
    global.fetch = abortableFetch({body: 'ok'});

    await fetchText('https://r.jina.ai/x', {method: 'GET'});

    expect((global.fetch as jest.Mock).mock.calls[0][1].credentials).toBe(
      'omit',
    );
  });

  it('omits credentials even when the caller asks to include them', async () => {
    global.fetch = abortableFetch({body: '{"a":1}'});

    await fetchJson('https://api.you.com/v1/search', {
      method: 'GET',
      credentials: 'include',
    });

    expect((global.fetch as jest.Mock).mock.calls[0][1].credentials).toBe(
      'omit',
    );
  });
});
