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
