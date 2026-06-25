import {ParallelProvider} from '../parallel';

const okJson = (body: unknown) =>
  Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(body)});

describe('ParallelProvider', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('normalizes excerpts to SearchHit.snippet', async () => {
    (global.fetch as jest.Mock).mockReturnValue(
      okJson({
        results: [
          {
            title: 'P',
            url: 'https://example.com/p',
            excerpts: ['ex one', 'ex two'],
            published_date: '2026-04-04',
          },
        ],
      }),
    );
    const provider = new ParallelProvider(() => 'key');
    const [hit] = await provider.search('q', {maxResults: 3});
    expect(hit.snippet).toBe('ex one ex two');
    expect(hit.url).toBe('https://example.com/p');
    expect(hit.publishedAt).toBe('2026-04-04');
  });

  it('maps a deep read to PageContent', async () => {
    (global.fetch as jest.Mock).mockReturnValue(
      okJson({results: [{title: 'Title', excerpts: ['a', 'b']}]}),
    );
    const provider = new ParallelProvider(() => 'key');
    const page = await provider.read!('https://example.com/x');
    expect(page.url).toBe('https://example.com/x');
    expect(page.title).toBe('Title');
    expect(page.text).toBe('a\nb');
  });

  it('returns [] for an empty or missing-field body without throwing', async () => {
    const provider = new ParallelProvider(() => 'key');
    for (const body of [{}, {results: null}, {results: []}]) {
      (global.fetch as jest.Mock).mockReturnValue(okJson(body));
      await expect(provider.search('q', {maxResults: 3})).resolves.toEqual([]);
    }
  });

  it('drops a hit with missing excerpts to an empty snippet, keeping url', async () => {
    (global.fetch as jest.Mock).mockReturnValue(
      okJson({results: [{title: 'P', url: 'https://e.com/p'}]}),
    );
    const provider = new ParallelProvider(() => 'key');
    const [hit] = await provider.search('q', {maxResults: 3});
    expect(hit).toEqual({title: 'P', url: 'https://e.com/p', snippet: ''});
  });

  it('throws when no key is set', async () => {
    const provider = new ParallelProvider(() => '');
    await expect(provider.search('q', {maxResults: 3})).rejects.toThrow(
      /key not set/i,
    );
  });
});
