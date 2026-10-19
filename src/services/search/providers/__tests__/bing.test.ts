import {BingProvider, parseBingResults} from '../bing';
import type {SearchProvider} from '../../types';

/** Shape lifted from a live Bing SERP (verified 2026-10-20): the result lives
 *  in an `<li class="b_algo">` with an `<h2>` title and a `<p>` snippet. */
const block = (url: string, title: string, snippet: string) =>
  `<li class="b_algo" data-id="1">` +
  `<div class="b_title"><div class="b_algoheader">` +
  `<a href="${url}" h="ID=SERP,5098.2"><h2>${title}</h2></a>` +
  `</div><div class="b_caption">` +
  `<p class="b_lineclamp3">${snippet}</p>` +
  `</div></div></li>`;

const okHtml = (body: string) =>
  Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(body),
  });

describe('parseBingResults', () => {
  it('extracts title, url and snippet from b_algo blocks', () => {
    const html = block(
      'https://react.dev/',
      '<strong>React</strong>',
      'The library for web and native user interfaces.',
    );
    expect(parseBingResults(html)).toEqual([
      {
        title: 'React',
        url: 'https://react.dev/',
        snippet: 'The library for web and native user interfaces.',
      },
    ]);
  });

  it('decodes numeric and named entities', () => {
    const html = block(
      'https://example.com/a?x=1&amp;y=2',
      'Caf&#233; &amp; Bar',
      'Sep 19, 2026 &#183; Rock &#x26; Roll &quot;quoted&quot;',
    );
    const [hit] = parseBingResults(html);
    expect(hit.title).toBe('Café & Bar');
    expect(hit.snippet).toBe('Sep 19, 2026 · Rock & Roll "quoted"');
  });

  it('skips blocks without an http(s) target (ads, suggestion cards)', () => {
    const html =
      `<li class="b_algo"><div><a href="/ck/a?u=1"><h2>Ad</h2></a>` +
      `<p>sponsored</p></div></li>` +
      block('https://real.example/', 'Real', 'body');
    const hits = parseBingResults(html);
    expect(hits).toHaveLength(1);
    expect(hits[0].url).toBe('https://real.example/');
  });

  it('falls back to the url as the title when no h2 is present', () => {
    const html = `<li class="b_algo"><a href="https://no-title.example/">x</a></li>`;
    expect(parseBingResults(html)[0].title).toBe('https://no-title.example/');
  });

  it('returns [] for markup with no result blocks', () => {
    expect(
      parseBingResults('<html><body><p>blocked</p></body></html>'),
    ).toEqual([]);
  });
});

describe('BingProvider', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('is keyless: searches without any key configured', async () => {
    (global.fetch as jest.Mock).mockReturnValue(
      okHtml(block('https://a.example/', 'A', 'body a')),
    );
    const provider = new BingProvider();
    const hits = await provider.search('q', {maxResults: 3});
    expect(hits).toHaveLength(1);
    // No Authorization/token header — there is no key to send.
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.stringify(init.headers)).not.toMatch(/token|api.?key/i);
  });

  it('requests the mobile SERP with an encoded query and pinned market', async () => {
    (global.fetch as jest.Mock).mockReturnValue(
      okHtml(block('https://a.example/', 'A', 'body a')),
    );
    const provider = new BingProvider();
    await provider.search('nobel prize 2026', {maxResults: 5});
    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('q=nobel%20prize%202026');
    expect(url).toContain('count=5');
    expect(url).toContain('mkt=en-US');
  });

  it('caps hits at maxResults', async () => {
    const html = [
      block('https://a.example/', 'A', 'a'),
      block('https://b.example/', 'B', 'b'),
      block('https://c.example/', 'C', 'c'),
    ].join('');
    (global.fetch as jest.Mock).mockReturnValue(okHtml(html));
    const provider = new BingProvider();
    const hits = await provider.search('q', {maxResults: 2});
    expect(hits.map(h => h.url)).toEqual([
      'https://a.example/',
      'https://b.example/',
    ]);
  });

  it('throws rather than returning an empty result set', async () => {
    (global.fetch as jest.Mock).mockReturnValue(okHtml('<html>blocked</html>'));
    const provider = new BingProvider();
    await expect(provider.search('q', {maxResults: 3})).rejects.toThrow(
      /no parseable results/i,
    );
  });

  it('propagates transport failures (never silent)', async () => {
    (global.fetch as jest.Mock).mockReturnValue(
      Promise.resolve({
        ok: false,
        status: 429,
        text: () => Promise.resolve(''),
      }),
    );
    const provider = new BingProvider();
    await expect(provider.search('q', {maxResults: 3})).rejects.toThrow(
      /request failed/i,
    );
  });

  it('has no native read (falls back to default reader)', () => {
    const provider: SearchProvider = new BingProvider();
    expect(provider.read).toBeUndefined();
  });
});
