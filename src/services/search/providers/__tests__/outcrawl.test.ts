import {OutcrawlProvider} from '../outcrawl';

const okJson = (body: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
  });

describe('OutcrawlProvider', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  describe('search', () => {
    it('normalizes hits[] to SearchHit[]', async () => {
      (global.fetch as jest.Mock).mockReturnValue(
        okJson({
          hits: [
            {
              url: 'https://example.com/mars',
              title: 'Mars news',
              snippet: 'A rover update.',
              rank: 1,
            },
          ],
          usage: {credits: '1'},
        }),
      );
      const provider = new OutcrawlProvider(() => 'key');
      const hits = await provider.search('mars', {maxResults: 3});
      expect(hits).toEqual([
        {
          title: 'Mars news',
          url: 'https://example.com/mars',
          snippet: 'A rover update.',
        },
      ]);
    });

    it('keeps url and title when snippet is empty', async () => {
      (global.fetch as jest.Mock).mockReturnValue(
        okJson({hits: [{title: 'T', url: 'https://e.com/x'}]}),
      );
      const provider = new OutcrawlProvider(() => 'key');
      const [hit] = await provider.search('q', {maxResults: 3});
      expect(hit.url).toBe('https://e.com/x');
      expect(hit.title).toBe('T');
      expect(hit.snippet).toBe('');
    });

    it('throws a fixed message when the body has no hits array', async () => {
      const provider = new OutcrawlProvider(() => 'key');
      for (const body of [
        null,
        {},
        {hits: null},
        {hits: {}},
        {error: 'upstream detail'},
      ]) {
        (global.fetch as jest.Mock).mockReturnValue(okJson(body));
        await expect(provider.search('q', {maxResults: 3})).rejects.toThrow(
          /^unexpected response$/,
        );
      }
    });

    it('returns [] when there are no hits', async () => {
      (global.fetch as jest.Mock).mockReturnValue(okJson({hits: []}));
      const provider = new OutcrawlProvider(() => 'key');
      await expect(provider.search('q', {maxResults: 3})).resolves.toEqual([]);
    });

    it('throws when no key is set (never silent)', async () => {
      const provider = new OutcrawlProvider(() => '');
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
      const provider = new OutcrawlProvider(() => 'key');
      await expect(provider.search('q', {maxResults: 3})).rejects.toThrow(
        /failed/i,
      );
    });

    it('sends the key as a bearer token and the limit', async () => {
      (global.fetch as jest.Mock).mockReturnValue(okJson({hits: []}));
      const provider = new OutcrawlProvider(() => ' oc-key ');
      await provider.search('mars rover', {maxResults: 4});
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe('https://api.outcrawl.ai/v1/search');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer oc-key');
      expect(JSON.parse(init.body)).toEqual({query: 'mars rover', limit: 4});
    });
  });

  describe('read', () => {
    it('returns the page markdown and title', async () => {
      (global.fetch as jest.Mock).mockReturnValue(
        okJson({
          url: 'https://e.com/p',
          statusCode: 200,
          markdown: '# Page\n\nBody',
          metadata: {title: 'Page', language: 'en'},
          usage: {credits: '1'},
        }),
      );
      const provider = new OutcrawlProvider(() => 'key');
      const page = await provider.read('https://e.com/p');
      expect(page).toEqual({
        url: 'https://e.com/p',
        title: 'Page',
        text: '# Page\n\nBody',
      });
    });

    it('returns empty text when the page has no markdown', async () => {
      (global.fetch as jest.Mock).mockReturnValue(okJson({statusCode: 200}));
      const provider = new OutcrawlProvider(() => 'key');
      const page = await provider.read('https://e.com/p');
      expect(page.text).toBe('');
      expect(page.title).toBeUndefined();
    });

    it('throws a fixed message when the body is not an object', async () => {
      const provider = new OutcrawlProvider(() => 'key');
      for (const body of [null, 'x']) {
        (global.fetch as jest.Mock).mockReturnValue(okJson(body));
        await expect(provider.read('https://e.com/p')).rejects.toThrow(
          new Error('scrape failed'),
        );
      }
    });

    it('fails from status 400 up and passes below it', async () => {
      const provider = new OutcrawlProvider(() => 'key');
      const scrape = (statusCode: number) =>
        okJson({statusCode, markdown: 'body', metadata: {}});

      (global.fetch as jest.Mock).mockReturnValue(scrape(399));
      await expect(provider.read('https://e.com/p')).resolves.toEqual({
        url: 'https://e.com/p',
        text: 'body',
      });

      for (const code of [400, 404, 500]) {
        (global.fetch as jest.Mock).mockReturnValue(scrape(code));
        await expect(provider.read('https://e.com/p')).rejects.toThrow(
          new Error(`page returned ${code}`),
        );
      }
    });

    it('throws on a non-ok response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 402,
        json: () => Promise.resolve({}),
      });
      const provider = new OutcrawlProvider(() => 'key');
      await expect(provider.read('https://e.com/p')).rejects.toThrow(/failed/i);
    });

    describe('client timeout', () => {
      beforeEach(() => {
        jest.useFakeTimers();
        (global.fetch as jest.Mock).mockImplementation(
          (_url: string, init: RequestInit) =>
            new Promise((_resolve, reject) => {
              init.signal?.addEventListener('abort', () => {
                const e = new Error('Aborted');
                e.name = 'AbortError';
                reject(e);
              });
            }),
        );
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('gives up on a stalled scrape at 12 s, not later', async () => {
        const provider = new OutcrawlProvider(() => 'key');
        let error: unknown;
        provider.read('https://e.com/p').catch(e => {
          error = e;
        });

        await jest.advanceTimersByTimeAsync(11999);
        expect(error).toBeUndefined();

        await jest.advanceTimersByTimeAsync(1);
        expect(error).toEqual(new Error('timed out'));
      });
    });

    it('throws when no key is set without calling fetch', async () => {
      const provider = new OutcrawlProvider(() => '');
      await expect(provider.read('https://e.com/p')).rejects.toThrow(
        /key not set/i,
      );
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('posts the scrape body with bearer auth', async () => {
      (global.fetch as jest.Mock).mockReturnValue(
        okJson({statusCode: 200, markdown: 'x'}),
      );
      const provider = new OutcrawlProvider(() => 'oc-key');
      await provider.read('https://e.com/p');
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe('https://api.outcrawl.ai/v1/scrape');
      expect(init.headers.Authorization).toBe('Bearer oc-key');
      expect(JSON.parse(init.body)).toEqual({
        url: 'https://e.com/p',
        formats: ['markdown'],
        onlyMainContent: true,
      });
    });
  });
});
