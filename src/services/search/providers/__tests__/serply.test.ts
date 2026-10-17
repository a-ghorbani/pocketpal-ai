import {SerplyProvider} from '../serply';
import type {SearchProvider} from '../../types';

const okJson = (body: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
  });

describe('SerplyProvider', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('normalizes results[] to SearchHit[] using description', async () => {
    (global.fetch as jest.Mock).mockReturnValue(
      okJson({
        results: [
          {
            title: 'Result',
            link: 'https://example.com/a',
            description: 'A compact body.',
          },
        ],
      }),
    );
    const provider = new SerplyProvider(() => 'key');
    const hits = await provider.search('q', {maxResults: 5});
    expect(hits).toEqual([
      {
        title: 'Result',
        url: 'https://example.com/a',
        snippet: 'A compact body.',
      },
    ]);
  });

  it('sends the query and count in the URL and the key as X-Api-Key', async () => {
    (global.fetch as jest.Mock).mockReturnValue(okJson({results: []}));
    const provider = new SerplyProvider(() => 'secret');
    await provider.search('mars & rovers?', {maxResults: 3});
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(
      'https://api.serply.io/v1/search?q=mars%20%26%20rovers%3F&num=3',
    );
    expect(init.headers['X-Api-Key']).toBe('secret');
    expect(init.headers['User-Agent']).toBe('pocketpal');
  });

  it('trims to maxResults and drops rows without an http(s) link', async () => {
    (global.fetch as jest.Mock).mockReturnValue(
      okJson({
        results: [
          {title: 'Token', link: 'CAESfQHrOzAV', description: 'x'},
          {title: 'Missing'},
          {title: 'A', link: 'https://e.com/a'},
          {title: 'B', link: 'http://e.com/b'},
          {title: 'C', link: 'https://e.com/c'},
        ],
      }),
    );
    const provider = new SerplyProvider(() => 'key');
    const hits = await provider.search('q', {maxResults: 2});
    expect(hits.map(h => h.url)).toEqual(['https://e.com/a', 'http://e.com/b']);
    expect(hits[0].snippet).toBe('');
  });

  it('has no native read (falls back to default reader)', () => {
    const provider: SearchProvider = new SerplyProvider(() => 'key');
    expect(provider.read).toBeUndefined();
  });

  it('throws when the body has no results array', async () => {
    const provider = new SerplyProvider(() => 'key');
    for (const body of [null, {}, {detail: 'Invalid API key'}]) {
      (global.fetch as jest.Mock).mockReturnValue(okJson(body));
      await expect(provider.search('q', {maxResults: 3})).rejects.toThrow(
        /^unexpected response$/,
      );
    }
  });

  it('returns [] for an empty results array', async () => {
    (global.fetch as jest.Mock).mockReturnValue(okJson({results: []}));
    const provider = new SerplyProvider(() => 'key');
    await expect(provider.search('q', {maxResults: 3})).resolves.toEqual([]);
  });

  it('throws when no key is set', async () => {
    const provider = new SerplyProvider(() => '');
    await expect(provider.search('q', {maxResults: 3})).rejects.toThrow(
      /key not set/i,
    );
  });
});
