import {WebSearchEngine} from '../WebSearchEngine';
import type {SearchAccess} from '../searchAccess';
import type {SearchHit, SearchProvider} from '../../search/types';
import * as budget from '../../search/searchBudget';
import {resetSearchCache} from '../../search/searchBudget';

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

  it('returns an error result when search is not enabled (never silent)', async () => {
    const access = makeAccess({canSearch: () => false});
    const result = await new WebSearchEngine(access).execute({query: 'mars'});
    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.summary).toMatch(/not enabled/i);
    }
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
