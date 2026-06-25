import {ReadUrlEngine} from '../ReadUrlEngine';
import type {SearchAccess} from '../searchAccess';
import type {SearchProvider, PageContent} from '../../search/types';
import * as budget from '../../search/searchBudget';

const makeAccess = (overrides: Partial<SearchAccess> = {}): SearchAccess => {
  const provider: SearchProvider = {
    id: 'tavily',
    search: jest.fn().mockResolvedValue([]),
  };
  return {
    getActiveProvider: () => provider,
    isConfigured: () => true,
    getResultCount: () => 3,
    readWithDefaultReader: jest
      .fn()
      .mockResolvedValue({url: 'https://e.com', text: 'fallback body'}),
    ...overrides,
  };
};

describe('ReadUrlEngine', () => {
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
    expect(read).toHaveBeenCalledWith('https://e.com/p');
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
    expect(readWithDefaultReader).toHaveBeenCalledWith('https://e.com/x');
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

  it('returns an error result when no key is configured', async () => {
    const access = makeAccess({isConfigured: () => false});
    const result = await new ReadUrlEngine(access).execute({
      url: 'https://e.com',
    });
    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.summary).toMatch(/key not set/i);
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
});
