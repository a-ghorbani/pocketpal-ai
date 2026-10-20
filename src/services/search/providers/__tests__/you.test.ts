import {
  YouProvider,
  YOU_FREE_LIMIT_MESSAGE,
  YOU_KEYED_LIMIT_MESSAGE,
} from '../you';
import type {SearchProvider} from '../../types';

const okJson = (body: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
  });

const status = (code: number) =>
  Promise.resolve({
    ok: false,
    status: code,
    text: () => Promise.resolve(''),
  });

describe('YouProvider', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('uses the free endpoint with no key and sends no X-API-Key', async () => {
    (global.fetch as jest.Mock).mockReturnValue(okJson({results: {web: []}}));
    const provider = new YouProvider(() => '');
    await provider.search('local llm news', {maxResults: 3});
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(
      'https://api.you.com/v1/agents/search?query=local%20llm%20news&count=3',
    );
    expect(init.method).toBe('GET');
    expect(init.headers['X-API-Key']).toBeUndefined();
  });

  it('uses the keyed Search API with X-API-Key when a key is set', async () => {
    (global.fetch as jest.Mock).mockReturnValue(okJson({results: {web: []}}));
    const provider = new YouProvider(() => ' secret ');
    await provider.search('q', {maxResults: 5});
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://ydc-index.io/v1/search?query=q&count=5');
    expect(init.headers['X-API-Key']).toBe('secret');
  });

  it('appends the You.com attribution token to the app User-Agent', async () => {
    (global.fetch as jest.Mock).mockReturnValue(okJson({results: {web: []}}));
    const provider = new YouProvider(() => '');
    await provider.search('q', {maxResults: 3});
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers['User-Agent']).toMatch(
      /^PocketPal\/\S+ \(ai\.pocketpal\) youdotcom-integration\/a-ghorbani-pocketpal-ai$/,
    );
  });

  it('normalizes results.web to SearchHit[] (description, then first snippet)', async () => {
    (global.fetch as jest.Mock).mockReturnValue(
      okJson({
        results: {
          web: [
            {
              title: 'A',
              url: 'https://example.com/a',
              description: 'Short description.',
              snippets: ['Longer snippet.'],
              page_age: '2026-08-26T00:00:00',
            },
            {
              title: 'B',
              url: 'https://example.com/b',
              description: '',
              snippets: ['Only a snippet.'],
            },
          ],
        },
      }),
    );
    const provider = new YouProvider(() => '');
    const hits = await provider.search('q', {maxResults: 5});
    expect(hits).toEqual([
      {
        title: 'A',
        url: 'https://example.com/a',
        snippet: 'Short description.',
        publishedAt: '2026-08-26T00:00:00',
      },
      {title: 'B', url: 'https://example.com/b', snippet: 'Only a snippet.'},
    ]);
  });

  it('returns [] when there are no web hits', async () => {
    const provider = new YouProvider(() => '');
    for (const body of [{results: {}}, {results: {web: []}}]) {
      (global.fetch as jest.Mock).mockReturnValue(okJson(body));
      await expect(provider.search('q', {maxResults: 3})).resolves.toEqual([]);
    }
  });

  it('throws when the body is not a results envelope', async () => {
    const provider = new YouProvider(() => '');
    for (const body of [null, {}, {results: {web: 'nope'}}]) {
      (global.fetch as jest.Mock).mockReturnValue(okJson(body));
      await expect(provider.search('q', {maxResults: 3})).rejects.toThrow(
        /^unexpected response$/,
      );
    }
  });

  describe('429', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    const rejectionAfterRetry = async (key: string) => {
      const search = new YouProvider(() => key)
        .search('q', {maxResults: 3})
        .catch((e: Error) => e);
      await jest.advanceTimersByTimeAsync(1000);
      expect(global.fetch).toHaveBeenCalledTimes(2);
      return search;
    };

    it('retries once, then returns the hits', async () => {
      (global.fetch as jest.Mock)
        .mockReturnValueOnce(status(429))
        .mockReturnValueOnce(
          okJson({results: {web: [{title: 'T', url: 'https://example.com'}]}}),
        );
      const search = new YouProvider(() => '').search('q', {maxResults: 3});
      await jest.advanceTimersByTimeAsync(999);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);

      expect(global.fetch).toHaveBeenCalledTimes(2);
      await expect(search).resolves.toHaveLength(1);
    });

    it('maps a repeated 429 with no key to the fixed free-limit message', async () => {
      (global.fetch as jest.Mock).mockReturnValue(status(429));
      const error = await rejectionAfterRetry('');
      expect(error).toEqual(new Error(YOU_FREE_LIMIT_MESSAGE));
      expect(YOU_FREE_LIMIT_MESSAGE).toMatch(/Settings → Internet Search/);
    });

    it('maps a repeated 429 with a key to the keyed rate-limit message', async () => {
      (global.fetch as jest.Mock).mockReturnValue(status(429));
      const error = await rejectionAfterRetry('k');
      expect(error).toEqual(new Error(YOU_KEYED_LIMIT_MESSAGE));
    });
  });

  it('passes other HTTP errors through unchanged', async () => {
    (global.fetch as jest.Mock).mockReturnValue(status(401));
    const provider = new YouProvider(() => 'bad');
    await expect(provider.search('q', {maxResults: 3})).rejects.toThrow(
      /^request failed \(401\)$/,
    );
  });

  it('has no native read (falls back to default reader)', () => {
    const provider: SearchProvider = new YouProvider(() => '');
    expect(provider.read).toBeUndefined();
  });
});
