import {BraveProvider} from '../brave';
import type {SearchProvider} from '../../types';

const okJson = (body: unknown) =>
  Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(body)});

describe('BraveProvider', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('normalizes web.results to SearchHit[] using description', async () => {
    (global.fetch as jest.Mock).mockReturnValue(
      okJson({
        web: {
          results: [
            {
              title: 'Result',
              url: 'https://example.com/a',
              description: 'A compact body.',
              page_age: '2026-02-02',
            },
          ],
        },
      }),
    );
    const provider = new BraveProvider(() => 'key');
    const hits = await provider.search('q', {maxResults: 5});
    expect(hits).toEqual([
      {
        title: 'Result',
        url: 'https://example.com/a',
        snippet: 'A compact body.',
        publishedAt: '2026-02-02',
      },
    ]);
  });

  it('sends the key as the X-Subscription-Token header', async () => {
    (global.fetch as jest.Mock).mockReturnValue(okJson({web: {results: []}}));
    const provider = new BraveProvider(() => 'secret');
    await provider.search('q', {maxResults: 3});
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers['X-Subscription-Token']).toBe('secret');
  });

  it('has no native read (falls back to default reader)', () => {
    const provider: SearchProvider = new BraveProvider(() => 'key');
    expect(provider.read).toBeUndefined();
  });

  it('throws when no key is set', async () => {
    const provider = new BraveProvider(() => '');
    await expect(provider.search('q', {maxResults: 3})).rejects.toThrow(
      /key not set/i,
    );
  });
});
