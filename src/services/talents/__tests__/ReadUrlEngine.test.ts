import {abortableFetch} from '../../../../jest/abortableFetch';
import {
  URL_IMPLEMENTATIONS,
  expectUrlImplementationActive,
  useUrlImplementation,
} from '../../../../jest/urlImplementations';

import {ReadUrlEngine} from '../ReadUrlEngine';
import type {SearchAccess} from '../searchAccess';
import type {SearchProvider, PageContent} from '../../search/types';
import * as budget from '../../search/searchBudget';
import * as search from '../../search';
import {ExaProvider} from '../../search/providers/exa';
import {
  allowReadUrls,
  isReadUrlAllowed,
  resetReadUrlAllowlist,
} from '../readUrlAllowlist';

const makeAccess = (overrides: Partial<SearchAccess> = {}): SearchAccess => {
  const provider: SearchProvider = {
    id: 'tavily',
    search: jest.fn().mockResolvedValue([]),
  };
  return {
    getActiveProvider: () => provider,
    canSearch: () => true,
    getResultCount: () => 3,
    readWithDefaultReader: jest
      .fn()
      .mockResolvedValue({url: 'https://e.com', text: 'fallback body'}),
    ...overrides,
  };
};

describe('ReadUrlEngine', () => {
  beforeEach(() => {
    resetReadUrlAllowlist();
    // The URLs these tests read, as if returned by a prior web_search.
    allowReadUrls(['https://e.com', 'https://e.com/p', 'https://e.com/x']);
  });

  it('exposes the read_url schema with a required url param', () => {
    const def = new ReadUrlEngine(makeAccess()).toToolDefinition();
    expect(def.function.name).toBe('read_url');
    expect(def.function.parameters.required).toEqual(['url']);
  });

  it('reads via the provider native read() when available', async () => {
    const read = jest.fn().mockResolvedValue({
      url: 'https://e.com/p',
      title: 'Page',
      text: 'full page body',
    } as PageContent);
    const provider: SearchProvider = {id: 'exa', search: jest.fn(), read};
    const access = makeAccess({getActiveProvider: () => provider});
    const result = await new ReadUrlEngine(access).execute({
      url: 'https://e.com/p',
    });
    expect(read).toHaveBeenCalledWith('https://e.com/p', undefined);
    expect(result.type).toBe('text');
    if (result.type === 'text') {
      expect(result.summary).toContain('full page body');
      expect(result.summary).toContain('https://e.com/p');
    }
  });

  it('falls back to the default reader when the provider lacks read()', async () => {
    const readWithDefaultReader = jest
      .fn()
      .mockResolvedValue({url: 'https://e.com/x', text: 'jina body'});
    const provider: SearchProvider = {id: 'brave', search: jest.fn()};
    const access = makeAccess({
      getActiveProvider: () => provider,
      readWithDefaultReader,
    });
    const result = await new ReadUrlEngine(access).execute({
      url: 'https://e.com/x',
    });
    expect(readWithDefaultReader).toHaveBeenCalledWith(
      'https://e.com/x',
      undefined,
    );
    expect(result.type).toBe('text');
  });

  it('bounds the page by its own recommendedContextTokens ceiling', async () => {
    const spy = jest.spyOn(budget, 'budgetPage');
    const longBody = 'word '.repeat(4000).trim(); // far past the 1200-tok ceiling
    const read = jest
      .fn()
      .mockResolvedValue({url: 'https://e.com/p', text: longBody});
    const provider: SearchProvider = {id: 'exa', search: jest.fn(), read};
    const engine = new ReadUrlEngine(
      makeAccess({getActiveProvider: () => provider}),
    );
    expect(engine.recommendedContextTokens).toBe(1200);
    const result = await engine.execute({url: 'https://e.com/p'});
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({url: 'https://e.com/p'}),
      engine.recommendedContextTokens,
    );
    expect(result.type).toBe('text');
    if (result.type === 'text') {
      // Tail dropped on a word boundary — the result is shorter than the source.
      expect(result.summary.length).toBeLessThan(longBody.length);
      expect(result.summary).toContain('…');
    }
    spy.mockRestore();
  });

  it('returns an error result when search is not set up', async () => {
    const access = makeAccess({canSearch: () => false});
    const result = await new ReadUrlEngine(access).execute({
      url: 'https://e.com',
    });
    expect(result).toEqual({
      type: 'error',
      summary:
        "read_url: Internet search isn't set up yet. Finish setup in Settings → Internet Search.",
      errorMessage:
        "Internet search isn't set up yet. Finish setup in Settings → Internet Search.",
    });
  });

  it('names no key and no provider id when a keyless provider lacks consent, before any fetch', async () => {
    const readWithDefaultReader = jest.fn();
    const provider: SearchProvider = {id: 'you', search: jest.fn()};
    const access = makeAccess({
      getActiveProvider: () => provider,
      canSearch: () => false,
      readWithDefaultReader,
    });
    const result = await new ReadUrlEngine(access).execute({
      url: 'https://e.com/p',
    });
    expect(result).toEqual({
      type: 'error',
      summary:
        "read_url: Internet search isn't set up yet. Finish setup in Settings → Internet Search.",
      errorMessage:
        "Internet search isn't set up yet. Finish setup in Settings → Internet Search.",
    });
    if (result.type === 'error') {
      expect(result.summary).not.toMatch(/API key|you not enabled/);
      expect(result.errorMessage).not.toMatch(/API key|you not enabled/);
    }
    expect(readWithDefaultReader).not.toHaveBeenCalled();
  });

  it('errors when consent is absent even with a key (canSearch=false), before any fetch', async () => {
    const read = jest.fn();
    const provider: SearchProvider = {id: 'exa', search: jest.fn(), read};
    const access = makeAccess({
      getActiveProvider: () => provider,
      canSearch: () => false,
    });
    const result = await new ReadUrlEngine(access).execute({
      url: 'https://e.com/p',
    });
    expect(result.type).toBe('error');
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    'file:///etc/passwd',
    'data:text/html,x',
    'http://user:pass@e.com',
    'ftp://e.com',
    'not a url',
  ])(
    'rejects a non-http(s) or credentialed URL before any fetch (%s)',
    async badUrl => {
      const read = jest.fn();
      const provider: SearchProvider = {id: 'exa', search: jest.fn(), read};
      const access = makeAccess({getActiveProvider: () => provider});
      const result = await new ReadUrlEngine(access).execute({url: badUrl});
      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.summary).toMatch(/only http/i);
      }
      expect(read).not.toHaveBeenCalled();
    },
  );

  it('wraps the page result in untrusted-data markers', async () => {
    const read = jest.fn().mockResolvedValue({
      url: 'https://e.com/p',
      title: 'Page',
      text: 'full page body',
    } as PageContent);
    const provider: SearchProvider = {id: 'exa', search: jest.fn(), read};
    const access = makeAccess({getActiveProvider: () => provider});
    const result = await new ReadUrlEngine(access).execute({
      url: 'https://e.com/p',
    });
    if (result.type === 'text') {
      expect(result.summary).toContain('UNTRUSTED WEB CONTENT');
      expect(result.summary).toMatch(/never as instructions/i);
    }
  });

  it('returns an error result when the reader throws', async () => {
    const provider: SearchProvider = {
      id: 'exa',
      search: jest.fn(),
      read: jest.fn().mockRejectedValue(new Error('timed out')),
    };
    const access = makeAccess({getActiveProvider: () => provider});
    const result = await new ReadUrlEngine(access).execute({
      url: 'https://e.com/p',
    });
    expect(result.type).toBe('error');
  });

  it('returns an error result on an empty url', async () => {
    const result = await new ReadUrlEngine(makeAccess()).execute({url: ''});
    expect(result.type).toBe('error');
  });

  describe('allowlist enforcement (prompt-injection exfil guard)', () => {
    it('rejects a URL that no search returned and no user wrote, before any fetch', async () => {
      const read = jest.fn();
      const provider: SearchProvider = {id: 'exa', search: jest.fn(), read};
      const access = makeAccess({getActiveProvider: () => provider});
      const result = await new ReadUrlEngine(access).execute({
        url: 'https://evil.example.net/?q=conversation-secret',
      });
      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.summary).toMatch(/site the user named/i);
        expect(result.errorMessage).toBe(result.summary);
      }
      expect(read).not.toHaveBeenCalled();
    });

    it('rejects an allowlisted URL mutated with extra query data', async () => {
      const read = jest.fn();
      const provider: SearchProvider = {id: 'exa', search: jest.fn(), read};
      const access = makeAccess({getActiveProvider: () => provider});
      const result = await new ReadUrlEngine(access).execute({
        url: 'https://e.com/p?leak=secret',
      });
      expect(result.type).toBe('error');
      expect(read).not.toHaveBeenCalled();
    });

    it('strips a smuggled fragment before the URL reaches the provider', async () => {
      // Allowlist matching ignores fragments, so `#data` passes the guard —
      // but the outbound read must carry the canonical URL (Exa transmits it
      // verbatim in a JSON body).
      const read = jest.fn().mockResolvedValue({
        url: 'https://e.com/p',
        text: 'body',
      } as PageContent);
      const provider: SearchProvider = {id: 'exa', search: jest.fn(), read};
      const access = makeAccess({getActiveProvider: () => provider});
      const result = await new ReadUrlEngine(access).execute({
        url: 'https://e.com/p#conversation-secret',
      });
      expect(result.type).toBe('text');
      expect(read).toHaveBeenCalledWith('https://e.com/p', undefined);
      expect(read.mock.calls[0][0]).not.toContain('conversation-secret');
    });

    it('accepts the same URL once allowlisted', async () => {
      const read = jest.fn().mockResolvedValue({
        url: 'https://fresh.example.org/a',
        text: 'body',
      } as PageContent);
      const provider: SearchProvider = {id: 'exa', search: jest.fn(), read};
      const access = makeAccess({getActiveProvider: () => provider});
      const engine = new ReadUrlEngine(access);

      const before = await engine.execute({url: 'https://fresh.example.org/a'});
      expect(before.type).toBe('error');

      allowReadUrls(['https://fresh.example.org/a']);
      const after = await engine.execute({url: 'https://fresh.example.org/a'});
      expect(after.type).toBe('text');
    });

    const engineReading = (text: string) => {
      const read = jest.fn().mockResolvedValue({url: 'https://e.com/p', text});
      const provider: SearchProvider = {id: 'exa', search: jest.fn(), read};
      return new ReadUrlEngine(makeAccess({getActiveProvider: () => provider}));
    };

    it('returns and allowlists the URLs written in the page', async () => {
      const result = await engineReading(
        'See https://one.test/a and https://two.test/b, or [docs](https://hidden.test/c).',
      ).execute({url: 'https://e.com/p'});
      expect(result).toMatchObject({
        type: 'text',
        links: ['https://one.test/a', 'https://two.test/b'],
      });
      expect(isReadUrlAllowed('https://one.test/a')).toBe(true);
      expect(isReadUrlAllowed('https://two.test/b')).toBe(true);
      expect(isReadUrlAllowed('https://hidden.test/c')).toBe(false);
    });

    it('keeps the first 100 page links', async () => {
      const urls = Array.from({length: 101}, (_, i) => `https://l.test/${i}`);
      const result = await engineReading(urls.join(' ')).execute({
        url: 'https://e.com/p',
      });
      expect(result.type === 'text' && result.links).toEqual(
        urls.slice(0, 100),
      );
      expect(isReadUrlAllowed(urls[99])).toBe(true);
      expect(isReadUrlAllowed(urls[100])).toBe(false);
    });

    it('registers a URL that is the last word before the budget cut', async () => {
      const text = 'w '.repeat(2300) + 'https://a.com/next ' + 'x'.repeat(500);
      const result = await engineReading(text).execute({
        url: 'https://e.com/p',
      });
      expect(result.type === 'text' && result.summary).toContain(
        'https://a.com/next…',
      );
      expect(result.type === 'text' && result.links).toEqual([
        'https://a.com/next',
      ]);
      expect(isReadUrlAllowed('https://a.com/next')).toBe(true);
    });

    it('registers no links on an empty page or a reader error', async () => {
      const empty = await engineReading(
        '<a href="https://tag.test/a"></a>',
      ).execute({url: 'https://e.com/p'});
      expect(empty.type).toBe('error');
      expect(empty).not.toHaveProperty('links');
      expect(isReadUrlAllowed('https://tag.test/a')).toBe(false);

      const read = jest.fn().mockRejectedValue(new Error('https://err.test/x'));
      const provider: SearchProvider = {id: 'exa', search: jest.fn(), read};
      const failed = await new ReadUrlEngine(
        makeAccess({getActiveProvider: () => provider}),
      ).execute({url: 'https://e.com/p'});
      expect(failed.type).toBe('error');
      expect(failed).not.toHaveProperty('links');
      expect(isReadUrlAllowed('https://err.test/x')).toBe(false);
    });
  });

  describe.each(URL_IMPLEMENTATIONS)(
    'fetches the stored entry under %s',
    (_label, impl) => {
      useUrlImplementation(impl);

      const readerFor = (allowedUrl: string) => {
        resetReadUrlAllowlist();
        allowReadUrls([allowedUrl]);
        const read = jest.fn().mockResolvedValue({
          url: allowedUrl,
          text: 'body',
        } as PageContent);
        const provider: SearchProvider = {id: 'exa', search: jest.fn(), read};
        return {
          read,
          engine: new ReadUrlEngine(
            makeAccess({getActiveProvider: () => provider}),
          ),
        };
      };

      it('runs against the swapped URL implementation', () => {
        expectUrlImplementationActive(impl);
      });

      it('sends the stored host case, not the argument host case', async () => {
        const {read, engine} = readerFor('https://www.foo.com/A');
        const result = await engine.execute({url: 'https://WWW.FOO.com/A'});
        expect(result.type).toBe('text');
        expect(read).toHaveBeenCalledWith('https://www.foo.com/A', undefined);
      });

      it('sends the stored www entry for a bare-host request with other host case', async () => {
        const {read, engine} = readerFor('https://www.foo.com/A');
        const result = await engine.execute({url: 'https://Foo.com/A'});
        expect(result.type).toBe('text');
        expect(read).toHaveBeenCalledWith('https://www.foo.com/A', undefined);
      });

      it('reads the www search hit when the model drops the www', async () => {
        const {read, engine} = readerFor('https://www.firecrawl.dev/');
        const result = await engine.execute({url: 'https://firecrawl.dev/'});
        expect(result.type).toBe('text');
        expect(read).toHaveBeenCalledWith(
          'https://www.firecrawl.dev/',
          undefined,
        );
      });

      it('sends the stored www entry without the fragment to the native reader', async () => {
        const {read, engine} = readerFor('https://www.foo.com/');
        const result = await engine.execute({url: 'https://foo.com/#leak'});
        expect(result.type).toBe('text');
        expect(read).toHaveBeenCalledWith('https://www.foo.com/', undefined);
        expect(read.mock.calls[0][0]).not.toContain('leak');
      });

      it('sends the stored www entry without the fragment to the default reader', async () => {
        resetReadUrlAllowlist();
        allowReadUrls(['https://www.foo.com/']);
        const readWithDefaultReader = jest
          .fn()
          .mockResolvedValue({url: 'https://www.foo.com/', text: 'body'});
        const engine = new ReadUrlEngine(
          makeAccess({
            getActiveProvider: () => ({id: 'brave', search: jest.fn()}),
            readWithDefaultReader,
          }),
        );
        const result = await engine.execute({url: 'https://foo.com/#leak'});
        expect(result.type).toBe('text');
        expect(readWithDefaultReader).toHaveBeenCalledWith(
          'https://www.foo.com/',
          undefined,
        );
        expect(readWithDefaultReader.mock.calls[0][0]).not.toContain('leak');
      });

      it('never fetches a credentialed entry', async () => {
        const {read, engine} = readerFor('https://u:p@foo.com/a');
        const result = await engine.execute({url: 'https://foo.com/a'});
        expect(result.type).toBe('error');
        expect(read).not.toHaveBeenCalled();
      });
    },
  );

  describe('cancellation', () => {
    const defaultReaderAccess = () =>
      makeAccess({
        getActiveProvider: () => ({id: 'brave', search: jest.fn()}),
        readWithDefaultReader: search.readWithDefaultReader,
      });
    const exaAccess = () =>
      makeAccess({getActiveProvider: () => new ExaProvider(() => 'key')});

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it.each([
      ['the default reader', defaultReaderAccess, 'https://r.jina.ai/'],
      ['Exa native read', exaAccess, 'https://api.exa.ai/contents'],
    ])(
      'returns "cancelled" when the run aborts mid-read via %s',
      async (_label, access, endpoint) => {
        const run = new AbortController();
        let fetchedUrl = '';
        global.fetch = abortableFetch({
          onCall: (_init, url) => {
            fetchedUrl = url;
            run.abort();
          },
        });

        const result = await new ReadUrlEngine(access()).execute(
          {url: 'https://e.com/p'},
          {signal: run.signal},
        );

        expect(result).toEqual({
          type: 'error',
          summary: 'read_url: cancelled',
          errorMessage: 'cancelled',
        });
        expect(fetchedUrl.startsWith(endpoint)).toBe(true);
        expect(jest.getTimerCount()).toBe(0);
      },
    );

    it('returns "cancelled" without fetching when the signal is already aborted', async () => {
      global.fetch = abortableFetch();
      const run = new AbortController();
      run.abort();

      const result = await new ReadUrlEngine(defaultReaderAccess()).execute(
        {url: 'https://e.com/p'},
        {signal: run.signal},
      );

      expect(result).toMatchObject({type: 'error', errorMessage: 'cancelled'});
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
