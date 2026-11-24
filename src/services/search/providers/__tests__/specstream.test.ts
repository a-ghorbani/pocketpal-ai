import {SpecStreamProvider} from '../specstream';

const okJson = (body: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
  });

describe('SpecStreamProvider', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  describe('search', () => {
    it('normalizes data.sources[] to SearchHit[]', async () => {
      (global.fetch as jest.Mock).mockReturnValue(
        okJson({
          data: {
            sources: [
              {
                title: 'Mars news',
                url: 'https://example.com/mars',
                snippet: 'A rover update.',
                published: '2026-11-20',
              },
            ],
          },
        }),
      );
      const provider = new SpecStreamProvider(() => 'key');
      const hits = await provider.search('mars', {maxResults: 3});
      expect(hits).toEqual([
        {
          title: 'Mars news',
          url: 'https://example.com/mars',
          snippet: 'A rover update.',
          publishedAt: '2026-11-20',
        },
      ]);
    });

    it('keeps url and title when snippet and published are absent', async () => {
      (global.fetch as jest.Mock).mockReturnValue(
        okJson({
          data: {sources: [{title: 'T', url: 'https://e.com/x'}]},
        }),
      );
      const provider = new SpecStreamProvider(() => 'key');
      const [hit] = await provider.search('q', {maxResults: 3});
      expect(hit).toEqual({
        title: 'T',
        url: 'https://e.com/x',
        snippet: '',
      });
    });

    it('throws a fixed message when the body is not a valid search envelope', async () => {
      const provider = new SpecStreamProvider(() => 'key');
      for (const body of [
        null,
        {},
        {data: null},
        {data: {sources: 'not-an-array'}},
      ]) {
        (global.fetch as jest.Mock).mockReturnValue(okJson(body));
        await expect(provider.search('q', {maxResults: 3})).rejects.toThrow(
          /^unexpected response$/,
        );
      }
    });

    it('returns [] for a valid envelope with no sources', async () => {
      const provider = new SpecStreamProvider(() => 'key');
      for (const body of [{data: {}}, {data: {sources: []}}]) {
        (global.fetch as jest.Mock).mockReturnValue(okJson(body));
        await expect(provider.search('q', {maxResults: 3})).resolves.toEqual(
          [],
        );
      }
    });

    it('throws when no key is set (never silent)', async () => {
      const provider = new SpecStreamProvider(() => '');
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
      const provider = new SpecStreamProvider(() => 'key');
      await expect(provider.search('q', {maxResults: 3})).rejects.toThrow(
        /failed/i,
      );
    });

    it('sends the key as a bearer token with q and num', async () => {
      (global.fetch as jest.Mock).mockReturnValue(
        okJson({data: {sources: []}}),
      );
      const provider = new SpecStreamProvider(() => ' ss-key ');
      await provider.search('mars rover', {maxResults: 4});
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe('https://api.specstream.ai/v1/web-search');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer ss-key');
      expect(JSON.parse(init.body)).toEqual({
        q: 'mars rover',
        num: 4,
      });
    });
  });

  describe('read', () => {
    it('returns the extracted markdown and title', async () => {
      (global.fetch as jest.Mock).mockReturnValue(
        okJson({
          data: {
            results: [
              {
                url: 'https://e.com/p',
                status: 'ok',
                title: 'Page',
                text: '# Page\n\nBody',
              },
            ],
          },
        }),
      );
      const provider = new SpecStreamProvider(() => 'key');
      const page = await provider.read('https://e.com/p');
      expect(page).toEqual({
        url: 'https://e.com/p',
        title: 'Page',
        text: '# Page\n\nBody',
      });
    });

    it('returns empty text when the extracted page has no text', async () => {
      (global.fetch as jest.Mock).mockReturnValue(
        okJson({data: {results: [{url: 'https://e.com/p', status: 'ok'}]}}),
      );
      const provider = new SpecStreamProvider(() => 'key');
      const page = await provider.read('https://e.com/p');
      expect(page.text).toBe('');
      expect(page.title).toBeUndefined();
    });

    it('throws a fixed message when the page status is not ok', async () => {
      const provider = new SpecStreamProvider(() => 'key');
      for (const status of ['blocked', 'not_found', 'empty', 'failed']) {
        (global.fetch as jest.Mock).mockReturnValue(
          okJson({data: {results: [{url: 'https://e.com/p', status}]}}),
        );
        await expect(provider.read('https://e.com/p')).rejects.toThrow(
          new Error('extract failed'),
        );
      }
    });

    it('throws when the body has no data or an empty results list', async () => {
      const provider = new SpecStreamProvider(() => 'key');
      for (const body of [null, {}, {data: null}, {data: {results: []}}]) {
        (global.fetch as jest.Mock).mockReturnValue(okJson(body));
        await expect(provider.read('https://e.com/p')).rejects.toThrow(
          new Error('extract failed'),
        );
      }
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

      it('gives up on a stalled extract at 12 s, not later', async () => {
        const provider = new SpecStreamProvider(() => 'key');
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

    it('throws on a non-ok extract response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 402,
        json: () => Promise.resolve({}),
      });
      const provider = new SpecStreamProvider(() => 'key');
      await expect(provider.read('https://e.com/p')).rejects.toThrow(
        new Error('request failed (402)'),
      );
    });

    it('throws when no key is set without calling fetch', async () => {
      const provider = new SpecStreamProvider(() => '');
      await expect(provider.read('https://e.com/p')).rejects.toThrow(
        /key not set/i,
      );
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('posts the extract body with bearer auth and markdown format', async () => {
      (global.fetch as jest.Mock).mockReturnValue(
        okJson({data: {results: [{status: 'ok', text: 'x'}]}}),
      );
      const provider = new SpecStreamProvider(() => 'ss-key');
      await provider.read('https://e.com/p');
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe('https://api.specstream.ai/v1/extract');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer ss-key');
      expect(JSON.parse(init.body)).toEqual({
        urls: ['https://e.com/p'],
        format: 'markdown',
      });
    });
  });
});
