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
});
