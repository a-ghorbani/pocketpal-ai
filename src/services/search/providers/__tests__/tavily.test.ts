import {TavilyProvider} from '../tavily';

const okJson = (body: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
  });

describe('TavilyProvider', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('normalizes wire results to SearchHit[]', async () => {
    (global.fetch as jest.Mock).mockReturnValue(
      okJson({
        results: [
          {
            title: 'Mars news',
            url: 'https://example.com/mars',
            content: 'A rover update.',
            published_date: '2026-01-01',
          },
        ],
      }),
    );
    const provider = new TavilyProvider(() => 'key');
    const hits = await provider.search('mars', {maxResults: 3});
    expect(hits).toEqual([
      {
        title: 'Mars news',
        url: 'https://example.com/mars',
        snippet: 'A rover update.',
        publishedAt: '2026-01-01',
      },
    ]);
  });

  it('requests 20 basic results in one search request', async () => {
    (global.fetch as jest.Mock).mockReturnValue(okJson({results: []}));
    const provider = new TavilyProvider(() => 'key');

    await provider.search('mars', {maxResults: 20});

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual(
      expect.objectContaining({
        query: 'mars',
        max_results: 20,
        search_depth: 'basic',
      }),
    );
  });

  it('keeps url and title when snippet is empty', async () => {
    (global.fetch as jest.Mock).mockReturnValue(
      okJson({results: [{title: 'T', url: 'https://e.com/x'}]}),
    );
    const provider = new TavilyProvider(() => 'key');
    const [hit] = await provider.search('q', {maxResults: 3});
    expect(hit.url).toBe('https://e.com/x');
    expect(hit.title).toBe('T');
    expect(hit.snippet).toBe('');
  });

  it('returns [] for an empty or missing-field body without throwing', async () => {
    const provider = new TavilyProvider(() => 'key');
    for (const body of [{}, {results: null}, {results: []}]) {
      (global.fetch as jest.Mock).mockReturnValue(okJson(body));
      await expect(provider.search('q', {maxResults: 3})).resolves.toEqual([]);
    }
  });

  it('throws when no key is set (never silent)', async () => {
    const provider = new TavilyProvider(() => '');
    await expect(provider.search('q', {maxResults: 3})).rejects.toThrow(
      /key not set/i,
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('throws on a non-ok response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({}),
    });
    const provider = new TavilyProvider(() => 'key');
    await expect(provider.search('q', {maxResults: 3})).rejects.toThrow(
      /failed/i,
    );
  });
});
