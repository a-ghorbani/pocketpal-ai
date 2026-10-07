import {FirecrawlProvider} from '../firecrawl';

const okJson = (body: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
  });

describe('FirecrawlProvider', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  describe('search', () => {
    it('normalizes data.web[] to SearchHit[]', async () => {
      (global.fetch as jest.Mock).mockReturnValue(
        okJson({
          success: true,
          data: {
            web: [
              {
                title: 'Mars news',
                url: 'https://example.com/mars',
                description: 'A rover update.',
              },
            ],
          },
        }),
      );
      const provider = new FirecrawlProvider(() => 'key');
      const hits = await provider.search('mars', {maxResults: 3});
      expect(hits).toEqual([
        {
          title: 'Mars news',
          url: 'https://example.com/mars',
          snippet: 'A rover update.',
        },
      ]);
    });

    it('keeps url and title when description is empty', async () => {
      (global.fetch as jest.Mock).mockReturnValue(
        okJson({data: {web: [{title: 'T', url: 'https://e.com/x'}]}}),
      );
      const provider = new FirecrawlProvider(() => 'key');
      const [hit] = await provider.search('q', {maxResults: 3});
      expect(hit.url).toBe('https://e.com/x');
      expect(hit.title).toBe('T');
      expect(hit.snippet).toBe('');
    });

    it('returns [] for an empty or missing-field body without throwing', async () => {
      const provider = new FirecrawlProvider(() => 'key');
      for (const body of [{}, {data: null}, {data: {web: []}}]) {
        (global.fetch as jest.Mock).mockReturnValue(okJson(body));
        await expect(provider.search('q', {maxResults: 3})).resolves.toEqual(
          [],
        );
      }
    });

    it('throws when no key is set (never silent)', async () => {
      const provider = new FirecrawlProvider(() => '');
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
      const provider = new FirecrawlProvider(() => 'key');
      await expect(provider.search('q', {maxResults: 3})).rejects.toThrow(
        /failed/i,
      );
    });

    it('sends the key as a bearer token, the limit, origin, and no scrapeOptions', async () => {
      (global.fetch as jest.Mock).mockReturnValue(okJson({data: {web: []}}));
      const provider = new FirecrawlProvider(() => ' fc-key ');
      await provider.search('mars rover', {maxResults: 4});
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe('https://api.firecrawl.dev/v2/search');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer fc-key');
      expect(JSON.parse(init.body)).toEqual({
        query: 'mars rover',
        limit: 4,
        origin: 'pocketpal',
      });
    });
  });

  describe('read', () => {
    it('returns the page markdown and title', async () => {
      (global.fetch as jest.Mock).mockReturnValue(
        okJson({
          success: true,
          data: {
            markdown: '# Page\n\nBody',
            metadata: {title: 'Page', statusCode: 200},
          },
        }),
      );
      const provider = new FirecrawlProvider(() => 'key');
      const page = await provider.read('https://e.com/p');
      expect(page).toEqual({
        url: 'https://e.com/p',
        title: 'Page',
        text: '# Page\n\nBody',
      });
    });

    it('returns empty text when the page has no markdown', async () => {
      (global.fetch as jest.Mock).mockReturnValue(
        okJson({success: true, data: {}}),
      );
      const provider = new FirecrawlProvider(() => 'key');
      const page = await provider.read('https://e.com/p');
      expect(page.text).toBe('');
      expect(page.title).toBeUndefined();
    });

    it('throws a fixed message on success: false, never the API error text', async () => {
      (global.fetch as jest.Mock).mockReturnValue(
        okJson({success: false, error: 'Site not supported'}),
      );
      const provider = new FirecrawlProvider(() => 'key');
      await expect(provider.read('https://e.com/p')).rejects.toThrow(
        new Error('scrape failed'),
      );
    });

    it('throws when the scraped page returned an error status', async () => {
      (global.fetch as jest.Mock).mockReturnValue(
        okJson({
          success: true,
          data: {markdown: 'Not found', metadata: {statusCode: 404}},
        }),
      );
      const provider = new FirecrawlProvider(() => 'key');
      await expect(provider.read('https://e.com/p')).rejects.toThrow(
        new Error('page returned 404'),
      );
    });

    it('throws when the body has no success flag or no data', async () => {
      const provider = new FirecrawlProvider(() => 'key');
      for (const body of [{error: 'x'}, {success: true, data: null}, {}]) {
        (global.fetch as jest.Mock).mockReturnValue(okJson(body));
        await expect(provider.read('https://e.com/p')).rejects.toThrow(
          new Error('scrape failed'),
        );
      }
    });

    it('throws on a non-ok scrape response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 402,
        json: () => Promise.resolve({}),
      });
      const provider = new FirecrawlProvider(() => 'key');
      await expect(provider.read('https://e.com/p')).rejects.toThrow(
        new Error('request failed (402)'),
      );
    });

    it('throws when no key is set without calling fetch', async () => {
      const provider = new FirecrawlProvider(() => '');
      await expect(provider.read('https://e.com/p')).rejects.toThrow(
        /key not set/i,
      );
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('posts the scrape body with bearer auth and origin', async () => {
      (global.fetch as jest.Mock).mockReturnValue(
        okJson({success: true, data: {markdown: 'x'}}),
      );
      const provider = new FirecrawlProvider(() => 'fc-key');
      await provider.read('https://e.com/p');
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe('https://api.firecrawl.dev/v2/scrape');
      expect(init.headers.Authorization).toBe('Bearer fc-key');
      expect(JSON.parse(init.body)).toEqual({
        url: 'https://e.com/p',
        formats: ['markdown'],
        onlyMainContent: true,
        timeout: 10000,
        origin: 'pocketpal',
      });
    });
  });
});
