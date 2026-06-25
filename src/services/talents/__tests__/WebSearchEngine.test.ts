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

  it('returns a text menu of budgeted hits on success', async () => {
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
    expect(result.type).toBe('text');
    if (result.type === 'text') {
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
});
