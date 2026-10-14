import {ParallelProvider} from '../parallel';
import type {SearchProvider} from '../../types';

const okJson = (body: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
  });

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

  it('has no native deep-read (read_url falls through to the default reader)', () => {
    const provider: SearchProvider = new ParallelProvider(() => 'key');
    expect(provider.read).toBeUndefined();
  });

  it('throws when the body has no results array', async () => {
    const provider = new ParallelProvider(() => 'key');
    for (const body of [null, {}, {results: null}]) {
      (global.fetch as jest.Mock).mockReturnValue(okJson(body));
      await expect(provider.search('q', {maxResults: 3})).rejects.toThrow(
        /^unexpected response$/,
      );
    }
  });

  it('returns [] for an explicit empty results array', async () => {
    (global.fetch as jest.Mock).mockReturnValue(okJson({results: []}));
    const provider = new ParallelProvider(() => 'key');
    await expect(provider.search('q', {maxResults: 3})).resolves.toEqual([]);
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
