import {ExaProvider} from '../exa';

const okJson = (body: unknown) =>
  Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(body)});

describe('ExaProvider', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('prefers highlights for the snippet, joining them', async () => {
    (global.fetch as jest.Mock).mockReturnValue(
      okJson({
        results: [
          {
            title: 'Doc',
            url: 'https://example.com/doc',
            highlights: ['first', 'second'],
            summary: 'unused summary',
            publishedDate: '2026-03-03',
          },
        ],
      }),
    );
    const provider = new ExaProvider(() => 'key');
    const [hit] = await provider.search('q', {maxResults: 3});
    expect(hit.snippet).toBe('first second');
    expect(hit.url).toBe('https://example.com/doc');
    expect(hit.publishedAt).toBe('2026-03-03');
  });

  it('falls back to summary then text when highlights are absent', async () => {
    (global.fetch as jest.Mock).mockReturnValue(
      okJson({results: [{url: 'https://e.com/x', summary: 'sum'}]}),
    );
    const provider = new ExaProvider(() => 'key');
    const [hit] = await provider.search('q', {maxResults: 3});
    expect(hit.snippet).toBe('sum');
  });

  it('supports a native deep-read mapped to PageContent', async () => {
    (global.fetch as jest.Mock).mockReturnValue(
      okJson({results: [{title: 'Page', text: 'full body text'}]}),
    );
    const provider = new ExaProvider(() => 'key');
    const page = await provider.read!('https://example.com/p');
    expect(page).toEqual({
      url: 'https://example.com/p',
      title: 'Page',
      text: 'full body text',
    });
  });

  it('returns [] for an empty or missing-field search body without throwing', async () => {
    const provider = new ExaProvider(() => 'key');
    for (const body of [{}, {results: null}, {results: []}]) {
      (global.fetch as jest.Mock).mockReturnValue(okJson(body));
      await expect(provider.search('q', {maxResults: 3})).resolves.toEqual([]);
    }
  });

  it('reads to empty text when the contents body has no result', async () => {
    (global.fetch as jest.Mock).mockReturnValue(okJson({}));
    const provider = new ExaProvider(() => 'key');
    const page = await provider.read!('https://e.com/x');
    expect(page).toEqual({url: 'https://e.com/x', text: ''});
  });

  it('throws when no key is set', async () => {
    const provider = new ExaProvider(() => '');
    await expect(provider.search('q', {maxResults: 3})).rejects.toThrow(
      /key not set/i,
    );
  });
});
