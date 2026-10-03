import {createSearchProvider, readWithDefaultReader} from '../index';
import type {SearchProviderId} from '../types';

describe('createSearchProvider', () => {
  it('builds the adapter matching each provider id', () => {
    const ids: SearchProviderId[] = ['tavily', 'brave', 'exa', 'parallel'];
    for (const id of ids) {
      expect(createSearchProvider(id, () => 'k').id).toBe(id);
    }
  });

  it('wires the key accessor lazily into the adapter', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({}),
    });
    let key = '';
    const provider = createSearchProvider('tavily', () => key);
    // No key yet → adapter throws "key not set" without a network call.
    await expect(provider.search('q', {maxResults: 3})).rejects.toThrow(
      /key not set/i,
    );
    expect(global.fetch).not.toHaveBeenCalled();
    // Accessor is read inside search() (lazy) — later key is picked up.
    key = 'now-set';
    await expect(provider.search('q', {maxResults: 3})).rejects.toThrow(
      /failed/i,
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('readWithDefaultReader (r.jina.ai fallback)', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('fetches via r.jina.ai and returns PageContent for the original url', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('clean page body'),
    });
    const page = await readWithDefaultReader('https://example.com/article');
    const [calledUrl] = (global.fetch as jest.Mock).mock.calls[0];
    expect(calledUrl).toBe('https://r.jina.ai/https://example.com/article');
    expect(page).toEqual({
      url: 'https://example.com/article',
      text: 'clean page body',
    });
  });

  it('throws on a non-ok reader response (never silent)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 502,
      text: () => Promise.resolve(''),
    });
    await expect(
      readWithDefaultReader('https://example.com/x'),
    ).rejects.toThrow(/failed/i);
  });
});
