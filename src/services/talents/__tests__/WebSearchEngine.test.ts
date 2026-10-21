import {abortableFetch} from '../../../../jest/abortableFetch';

import {WebSearchEngine} from '../WebSearchEngine';
import type {SearchAccess} from '../searchAccess';
import type {SearchHit, SearchProvider} from '../../search/types';
import * as budget from '../../search/searchBudget';
import {resetSearchCache} from '../../search/searchBudget';
import {BraveProvider} from '../../search/providers/brave';
import {TavilyProvider} from '../../search/providers/tavily';
import * as readUrlAllowlist from '../readUrlAllowlist';

const hit = (overrides: Partial<SearchHit> = {}): SearchHit => ({
  title: 'Title',
  url: 'https://example.com/a',
  snippet: 'A snippet.',
  ...overrides,
});

const makeAccess = (overrides: Partial<SearchAccess> = {}): SearchAccess => {
  const provider: SearchProvider = {
    id: 'tavily',
    search: jest.fn().mockResolvedValue([hit()]),
  };
  return {
    getActiveProvider: () => provider,
    canSearch: () => true,
    getResultCount: () => 3,
    readWithDefaultReader: jest.fn(),
    ...overrides,
  };
};

describe('WebSearchEngine', () => {
  beforeEach(() => resetSearchCache());

  it('exposes the web_search schema with a required query param', () => {
    const def = new WebSearchEngine(makeAccess()).toToolDefinition();
    expect(def.function.name).toBe('web_search');
    expect(def.function.parameters.required).toEqual(['query']);
    // maxResults is NOT a tool parameter — settings own it.
    expect(def.function.parameters.properties).not.toHaveProperty('maxResults');
  });

  it('returns a structured search result of budgeted hits on success', async () => {
    const provider: SearchProvider = {
      id: 'tavily',
      search: jest
        .fn()
        .mockResolvedValue([
          hit({title: 'Mars', url: 'https://m.com', snippet: 'rover'}),
        ]),
    };
    const access = makeAccess({getActiveProvider: () => provider});
    const result = await new WebSearchEngine(access).execute({query: 'mars'});
    expect(result.type).toBe('search');
    if (result.type === 'search') {
      expect(result.query).toBe('mars');
      expect(result.results).toEqual([
        {title: 'Mars', url: 'https://m.com', snippet: 'rover'},
      ]);
      expect(result.summary).toContain('Mars');
      expect(result.summary).toContain('https://m.com');
    }
  });

  it('returns an error result when search is not set up (never silent)', async () => {
    const access = makeAccess({canSearch: () => false});
    const result = await new WebSearchEngine(access).execute({query: 'mars'});
    expect(result).toEqual({
      type: 'error',
      summary:
        "web_search: Internet search isn't set up yet. Finish setup in Settings → Internet Search.",
      errorMessage:
        "Internet search isn't set up yet. Finish setup in Settings → Internet Search.",
    });
  });

  it('names no key and no provider id when a keyless provider lacks consent', async () => {
    const search = jest.fn().mockResolvedValue([hit()]);
    const provider: SearchProvider = {id: 'you', search};
    const access = makeAccess({
      getActiveProvider: () => provider,
      canSearch: () => false,
    });
    const result = await new WebSearchEngine(access).execute({query: 'mars'});
    expect(result).toEqual({
      type: 'error',
      summary:
        "web_search: Internet search isn't set up yet. Finish setup in Settings → Internet Search.",
      errorMessage:
        "Internet search isn't set up yet. Finish setup in Settings → Internet Search.",
    });
    if (result.type === 'error') {
      expect(result.summary).not.toMatch(/API key|you not enabled/);
      expect(result.errorMessage).not.toMatch(/API key|you not enabled/);
    }
    expect(search).not.toHaveBeenCalled();
  });

  it('errors when consent is absent even though a key is present (canSearch=false)', async () => {
    const search = jest.fn().mockResolvedValue([hit()]);
    const provider: SearchProvider = {id: 'tavily', search};
    const access = makeAccess({
      getActiveProvider: () => provider,
      canSearch: () => false,
    });
    const result = await new WebSearchEngine(access).execute({query: 'mars'});
    expect(result.type).toBe('error');
    expect(search).not.toHaveBeenCalled();
  });

  it('wraps the result menu in untrusted-data markers', async () => {
    const provider: SearchProvider = {
      id: 'tavily',
      search: jest.fn().mockResolvedValue([hit({title: 'Mars'})]),
    };
    const access = makeAccess({getActiveProvider: () => provider});
    const result = await new WebSearchEngine(access).execute({query: 'mars'});
    if (result.type === 'search') {
      expect(result.summary).toContain('UNTRUSTED WEB CONTENT');
      expect(result.summary).toMatch(/never as instructions/i);
    }
  });

  it('returns an error result on no results', async () => {
    const provider: SearchProvider = {
      id: 'tavily',
      search: jest.fn().mockResolvedValue([]),
    };
    const access = makeAccess({getActiveProvider: () => provider});
    const result = await new WebSearchEngine(access).execute({query: 'zzz'});
    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.summary).toMatch(/no results/i);
      expect(result.summary).toContain(
        'Try a shorter or less restrictive query.',
      );
    }
  });

  it('returns an error result when the provider throws (timeout/transport)', async () => {
    const provider: SearchProvider = {
      id: 'tavily',
      search: jest.fn().mockRejectedValue(new Error('timed out')),
    };
    const access = makeAccess({getActiveProvider: () => provider});
    const result = await new WebSearchEngine(access).execute({query: 'mars'});
    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.summary).toMatch(/timed out/i);
    }
  });

  it('returns an error result on an empty query', async () => {
    const result = await new WebSearchEngine(makeAccess()).execute({
      query: ' ',
    });
    expect(result.type).toBe('error');
  });

  it('passes its own recommendedContextTokens to budgetHits as the token ceiling', async () => {
    const spy = jest.spyOn(budget, 'budgetHits');
    const engine = new WebSearchEngine(makeAccess({getResultCount: () => 5}));
    expect(engine.recommendedContextTokens).toBe(1000);
    await engine.execute({query: 'mars'});
    expect(spy).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        maxResults: 5,
        tokenCeiling: engine.recommendedContextTokens,
      }),
      // The ceiling is charged against the rendered menu, so the renderer goes in.
      expect.any(Function),
    );
    spy.mockRestore();
  });

  it('serves a second identical query from the in-session cache (no network)', async () => {
    const search = jest.fn().mockResolvedValue([hit()]);
    const provider: SearchProvider = {id: 'tavily', search};
    const access = makeAccess({getActiveProvider: () => provider});
    const engine = new WebSearchEngine(access);
    await engine.execute({query: 'mars'});
    await engine.execute({query: 'mars'});
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('re-hits the provider after an empty result (no empty-result lockout)', async () => {
    const search = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([hit({title: 'Mars'})]);
    const provider: SearchProvider = {id: 'tavily', search};
    const access = makeAccess({getActiveProvider: () => provider});
    const engine = new WebSearchEngine(access);

    const first = await engine.execute({query: 'mars'});
    expect(first.type).toBe('error');

    const second = await engine.execute({query: 'mars'});
    expect(search).toHaveBeenCalledTimes(2);
    expect(second.type).toBe('search');
    if (second.type === 'search') {
      expect(second.summary).toContain('Mars');
    }
  });

  it('treats an all-rejected budget as no-results and does not cache it', async () => {
    // Every URL exceeds the 2048-char cap, so budgeting drops them all. The
    // first call must report no-results (not a hollow empty success), and the
    // identical retry must re-hit the provider rather than read a cached empty.
    const longUrl = `https://e.com/${'a'.repeat(2100)}`;
    const search = jest
      .fn()
      .mockResolvedValueOnce([hit({url: longUrl})])
      .mockResolvedValueOnce([hit({title: 'Mars', url: 'https://m.com'})]);
    const provider: SearchProvider = {id: 'tavily', search};
    const access = makeAccess({getActiveProvider: () => provider});
    const engine = new WebSearchEngine(access);

    const first = await engine.execute({query: 'mars'});
    expect(first.type).toBe('error');

    const second = await engine.execute({query: 'mars'});
    expect(search).toHaveBeenCalledTimes(2);
    expect(second.type).toBe('search');
  });

  it('anchors recency by stamping the retrieval date in the results header', async () => {
    const provider: SearchProvider = {
      id: 'tavily',
      search: jest.fn().mockResolvedValue([hit({title: 'Mars'})]),
    };
    const access = makeAccess({getActiveProvider: () => provider});
    const result = await new WebSearchEngine(access).execute({query: 'mars'});
    const today = new Date().toISOString().slice(0, 10);
    if (result.type === 'search') {
      expect(result.summary).toContain(
        `## Web search results for "mars" (retrieved ${today})`,
      );
    }
  });

  it('formats each hit as a markdown bullet (title/date/snippet/url, no numbering)', async () => {
    const provider: SearchProvider = {
      id: 'tavily',
      search: jest.fn().mockResolvedValue([
        hit({
          title: 'Mars',
          url: 'https://m.com',
          snippet: 'rover',
          publishedAt: '2026-07-01',
        }),
        hit({title: 'Venus', url: 'https://v.com', snippet: 'clouds'}),
      ]),
    };
    const access = makeAccess({getActiveProvider: () => provider});
    const result = await new WebSearchEngine(access).execute({query: 'mars'});
    expect(result.type).toBe('search');
    if (result.type === 'search') {
      expect(result.summary).toContain(
        '- **Mars** *(2026-07-01)*\n  rover\n  <https://m.com>',
      );
      expect(result.summary).toContain(
        '<https://m.com>\n- **Venus**\n  clouds\n  <https://v.com>',
      );
      expect(result.summary).not.toMatch(/^\s*\d+\.\s/m);
    }
  });

  it('falls back to the URL as the title and omits the snippet line when empty', async () => {
    const provider: SearchProvider = {
      id: 'tavily',
      search: jest
        .fn()
        .mockResolvedValue([
          hit({title: '', url: 'https://bare.com', snippet: ''}),
        ]),
    };
    const access = makeAccess({getActiveProvider: () => provider});
    const result = await new WebSearchEngine(access).execute({query: 'bare'});
    if (result.type === 'search') {
      expect(result.summary).toContain(
        '- **https://bare.com**\n  <https://bare.com>',
      );
    }
  });

  it('allowlists its budgeted hit URLs for read_url', async () => {
    const allowlist = require('../readUrlAllowlist');
    allowlist.resetReadUrlAllowlist();
    const provider: SearchProvider = {
      id: 'tavily',
      search: jest
        .fn()
        .mockResolvedValue([hit({url: 'https://found.example.com/a'})]),
    };
    const access = makeAccess({getActiveProvider: () => provider});
    expect(allowlist.isReadUrlAllowed('https://found.example.com/a')).toBe(
      false,
    );
    await new WebSearchEngine(access).execute({query: 'mars'});
    expect(allowlist.isReadUrlAllowed('https://found.example.com/a')).toBe(
      true,
    );
  });

  it('caches the budgeted hits, not the raw provider payload', async () => {
    const spy = jest.spyOn(budget, 'setCachedHits');
    const oversized = 'x'.repeat(5000);
    const provider: SearchProvider = {
      id: 'tavily',
      search: jest.fn().mockResolvedValue([hit({snippet: oversized})]),
    };
    const access = makeAccess({getActiveProvider: () => provider});
    await new WebSearchEngine(access).execute({query: 'mars'});
    const stored = spy.mock.calls[0][3];
    expect(stored[0].snippet.length).toBeLessThan(oversized.length);
    spy.mockRestore();
  });

  describe('with the Brave provider', () => {
    const braveAccess = () =>
      makeAccess({getActiveProvider: () => new BraveProvider(() => 'key')});
    const respond = (body: unknown) => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(body)),
      });
    };

    it('reports a non-search body as an error, not as no results', async () => {
      respond({web: {results: []}});
      const result = await new WebSearchEngine(braveAccess()).execute({
        query: 'mars',
      });
      expect(result).toEqual({
        type: 'error',
        summary: 'web_search: unexpected response',
        errorMessage: 'unexpected response',
      });
    });

    it('reports a search envelope without web hits as no results', async () => {
      respond({type: 'search'});
      const result = await new WebSearchEngine(braveAccess()).execute({
        query: 'mars',
      });
      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.summary).toMatch(/no results for "mars"/);
      }
    });
  });

  describe('cancellation', () => {
    const tavilyAccess = () =>
      makeAccess({getActiveProvider: () => new TavilyProvider(() => 'key')});

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    it('returns "cancelled" when the run aborts mid-search, caching and allowlisting nothing', async () => {
      const run = new AbortController();
      global.fetch = abortableFetch({onCall: () => run.abort()});
      const setCached = jest.spyOn(budget, 'setCachedHits');
      const allow = jest.spyOn(readUrlAllowlist, 'allowReadUrls');

      const result = await new WebSearchEngine(tavilyAccess()).execute(
        {query: 'mars'},
        {signal: run.signal},
      );

      expect(result).toEqual({
        type: 'error',
        summary: 'web_search: cancelled',
        errorMessage: 'cancelled',
      });
      expect(setCached).not.toHaveBeenCalled();
      expect(allow).not.toHaveBeenCalled();
      expect(budget.getCachedHits('tavily', 'mars', 3)).toBeUndefined();
      jest.advanceTimersByTime(13000);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('returns "cancelled" without fetching when the signal is already aborted', async () => {
      global.fetch = abortableFetch();
      const run = new AbortController();
      run.abort();

      const result = await new WebSearchEngine(tavilyAccess()).execute(
        {query: 'mars'},
        {signal: run.signal},
      );

      expect(result).toMatchObject({type: 'error', errorMessage: 'cancelled'});
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('reports a provider timeout as "timed out" while a run signal is live', async () => {
      global.fetch = abortableFetch();
      const run = new AbortController();

      const pending = new WebSearchEngine(tavilyAccess()).execute(
        {query: 'mars'},
        {signal: run.signal},
      );
      jest.advanceTimersByTime(12000);
      const result = await pending;
      run.abort();

      expect(result).toEqual({
        type: 'error',
        summary: 'web_search: timed out',
        errorMessage: 'timed out',
      });
    });

    it('leaves no listener on the run signal after several searches', async () => {
      global.fetch = abortableFetch({body: '{"results":[]}'});
      const run = new AbortController();
      const add = jest.spyOn(run.signal, 'addEventListener');
      const remove = jest.spyOn(run.signal, 'removeEventListener');
      const engine = new WebSearchEngine(tavilyAccess());

      for (const query of ['mars', 'venus', 'pluto']) {
        await engine.execute({query}, {signal: run.signal});
      }

      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(add).toHaveBeenCalledTimes(3);
      expect(remove.mock.calls).toEqual(add.mock.calls);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('serves a cache hit with no network even when the signal is aborted', async () => {
      global.fetch = abortableFetch();
      budget.setCachedHits('tavily', 'mars', 3, [hit({title: 'Cached'})]);
      const run = new AbortController();
      run.abort();

      const result = await new WebSearchEngine(tavilyAccess()).execute(
        {query: 'mars'},
        {signal: run.signal},
      );

      expect(result.type).toBe('search');
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('rate limits', () => {
    const hitUrl = 'https://found.example.com/mars';
    const tavilyAccess = () =>
      makeAccess({getActiveProvider: () => new TavilyProvider(() => 'key')});
    const rateLimited = (entries: Record<string, string> = {}) => ({
      ok: false,
      status: 429,
      headers: {get: (name: string) => entries[name.toLowerCase()] ?? null},
      text: () => Promise.resolve(''),
    });
    const found = {
      ok: true,
      status: 200,
      headers: {get: () => null},
      text: () =>
        Promise.resolve(
          JSON.stringify({
            results: [{title: 'Mars', url: hitUrl, content: 'rover'}],
          }),
        ),
    };
    const rateLimitError = {
      type: 'error',
      summary: 'web_search: request failed (429)',
      errorMessage: 'request failed (429)',
    };

    beforeEach(() => {
      jest.useFakeTimers();
      readUrlAllowlist.resetReadUrlAllowlist();
    });

    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    it('succeeds after one retry, caching and allowlisting the hits once', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(rateLimited({'retry-after': '1'}))
        .mockResolvedValueOnce(found);
      const setCached = jest.spyOn(budget, 'setCachedHits');
      const allow = jest.spyOn(readUrlAllowlist, 'allowReadUrls');

      const pending = new WebSearchEngine(tavilyAccess()).execute({
        query: 'mars',
      });
      await jest.advanceTimersByTimeAsync(1000);
      const result = await pending;

      expect(result.type).toBe('search');
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(setCached).toHaveBeenCalledTimes(1);
      expect(allow).toHaveBeenCalledTimes(1);
      expect(budget.getCachedHits('tavily', 'mars', 3)).toHaveLength(1);
      expect(readUrlAllowlist.matchReadUrl(hitUrl)).not.toBeNull();
    });

    it('reports the existing error when the retry is rate-limited too', async () => {
      global.fetch = jest.fn().mockResolvedValue(rateLimited());

      const pending = new WebSearchEngine(tavilyAccess()).execute({
        query: 'mars',
      });
      await jest.advanceTimersByTimeAsync(1000);

      expect(await pending).toEqual(rateLimitError);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('reports the existing error at once when the server asks for more than 2 s', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(rateLimited({'retry-after': '30'}));

      const result = await new WebSearchEngine(tavilyAccess()).execute({
        query: 'mars',
      });

      expect(result).toEqual(rateLimitError);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('returns "cancelled" when the run aborts during the wait', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(rateLimited({'x-ratelimit-reset': '1'}))
        .mockResolvedValueOnce(found);
      const run = new AbortController();

      const pending = new WebSearchEngine(tavilyAccess()).execute(
        {query: 'mars'},
        {signal: run.signal},
      );
      await jest.advanceTimersByTimeAsync(500);
      run.abort();

      expect(await pending).toEqual({
        type: 'error',
        summary: 'web_search: cancelled',
        errorMessage: 'cancelled',
      });
      await jest.advanceTimersByTimeAsync(5000);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('identical searches in flight', () => {
    const unhandled = jest.fn();
    const marsUrl = 'https://example.com/mars';
    const afterTick = () => new Promise(resolve => setImmediate(resolve));

    beforeEach(() => {
      unhandled.mockClear();
      process.on('unhandledRejection', unhandled);
      readUrlAllowlist.resetReadUrlAllowlist();
    });

    afterEach(() => {
      process.off('unhandledRejection', unhandled);
    });

    it('share one request and its results, which are cached and allowlisted', async () => {
      const search = jest.fn(async (query: string) => [
        hit({title: query, url: `https://example.com/${query}`}),
      ]);
      const engine = new WebSearchEngine(
        makeAccess({getActiveProvider: () => ({id: 'tavily', search})}),
      );

      const [o0, o1, o2] = await Promise.all(
        ['mars', 'mars', 'venus'].map(query => engine.execute({query})),
      );

      expect(search).toHaveBeenCalledTimes(2);
      expect(o0.type).toBe('search');
      expect((o1 as any).results).toEqual((o0 as any).results);
      expect((o2 as any).query).toBe('venus');
      expect(budget.getCachedHits('tavily', 'mars', 3)).toBeDefined();
      expect(readUrlAllowlist.matchReadUrl(marsUrl)).not.toBeNull();

      resetSearchCache();
      await engine.execute({query: 'mars'});
      expect(search).toHaveBeenCalledTimes(3);
    });

    it('fail together on a shared failure, caching nothing, and a later search fetches again', async () => {
      const search = jest
        .fn()
        .mockRejectedValueOnce(new Error('request failed (500)'))
        .mockResolvedValue([hit()]);
      const engine = new WebSearchEngine(
        makeAccess({getActiveProvider: () => ({id: 'tavily', search})}),
      );

      const results = await Promise.all([
        engine.execute({query: 'mars'}),
        engine.execute({query: 'mars'}),
      ]);

      expect(results.map(r => r.summary)).toEqual([
        'web_search: request failed (500)',
        'web_search: request failed (500)',
      ]);
      expect(budget.getCachedHits('tavily', 'mars', 3)).toBeUndefined();

      await engine.execute({query: 'mars'});
      expect(search).toHaveBeenCalledTimes(2);
      await afterTick();
      expect(unhandled).not.toHaveBeenCalled();
    });

    it('cancel together on Stop, caching nothing, and a later search fetches again', async () => {
      global.fetch = abortableFetch();
      const engine = new WebSearchEngine(
        makeAccess({getActiveProvider: () => new TavilyProvider(() => 'key')}),
      );
      const run = new AbortController();
      const pending = Promise.all([
        engine.execute({query: 'mars'}, {signal: run.signal}),
        engine.execute({query: 'mars'}, {signal: run.signal}),
      ]);
      for (
        let i = 0;
        i < 50 && (global.fetch as jest.Mock).mock.calls.length === 0;
        i += 1
      ) {
        await Promise.resolve();
      }

      run.abort();
      const results = await pending;

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(results.map(r => (r as any).errorMessage)).toEqual([
        'cancelled',
        'cancelled',
      ]);
      expect(budget.getCachedHits('tavily', 'mars', 3)).toBeUndefined();

      global.fetch = abortableFetch({
        body: JSON.stringify({
          results: [{title: 'Mars', url: marsUrl, content: 'rover'}],
        }),
      });
      const later = await engine.execute(
        {query: 'mars'},
        {signal: new AbortController().signal},
      );
      expect(later.type).toBe('search');
      expect(global.fetch).toHaveBeenCalledTimes(1);
      await afterTick();
      expect(unhandled).not.toHaveBeenCalled();
    });
  });

  describe('systemPromptFragment', () => {
    const frag = (active: string[]) =>
      new WebSearchEngine(makeAccess()).systemPromptFragment({
        now: new Date('2026-07-15T12:00:00Z'),
        maxToolTurns: 5,
        activeTalents: new Set(active),
      });

    it("grounds today's date, the tool budget, and search guidance", () => {
      const fragment = frag(['web_search', 'read_url']);
      expect(fragment).toContain("Today's date is 2026-07-15");
      expect(fragment).toContain('budget of 4 tool calls');
      expect(fragment).toContain('web_search');
      expect(fragment).toContain('cite');
    });

    it('mentions read_url only when read_url is also active', () => {
      expect(frag(['web_search', 'read_url'])).toContain('read_url');
      expect(frag(['web_search'])).not.toContain('read_url');
    });
  });
});
