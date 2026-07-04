import {WebSearchEngine} from '../WebSearchEngine';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('WebSearchEngine', () => {
  const engine = new WebSearchEngine();

  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('exposes name "web_search"', () => {
    expect(engine.name).toBe('web_search');
  });

  it('returns error for empty query', async () => {
    const result = await engine.execute({query: ''});
    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.errorMessage).toMatch(/query argument is required/);
    }
  });

  it('returns error for missing query', async () => {
    const result = await engine.execute({});
    expect(result.type).toBe('error');
  });

  it('returns error for non-string query', async () => {
    const result = await engine.execute({query: 42 as any});
    expect(result.type).toBe('error');
  });

  it('returns answer from DuckDuckGo', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Answer: '42',
        AnswerType: 'calc',
        AbstractText: '',
        RelatedTopics: [],
      }),
    });

    const result = await engine.execute({query: 'meaning of life'});

    expect(result.type).toBe('text');
    if (result.type === 'text') {
      expect(result.summary).toContain('Answer: 42');
    }
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('q=meaning%20of%20life'),
      expect.any(Object),
    );
  });

  it('returns abstract when no direct answer', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Answer: '',
        AbstractText: 'Python is a programming language.',
        AbstractSource: 'Wikipedia',
        AbstractURL: 'https://en.wikipedia.org/wiki/Python',
        RelatedTopics: [],
      }),
    });

    const result = await engine.execute({query: 'python programming'});

    expect(result.type).toBe('text');
    if (result.type === 'text') {
      expect(result.summary).toContain('Python is a programming language.');
      expect(result.summary).toContain('Wikipedia');
      expect(result.summary).toContain('https://en.wikipedia.org/wiki/Python');
    }
  });

  it('returns related topics', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Answer: '',
        AbstractText: '',
        RelatedTopics: [
          {text: 'Result 1', url: 'https://example.com/1'},
          {text: 'Result 2', url: 'https://example.com/2'},
          {text: 'Result 3', url: 'https://example.com/3'},
        ],
      }),
    });

    const result = await engine.execute({query: 'test'});

    expect(result.type).toBe('text');
    if (result.type === 'text') {
      expect(result.summary).toContain('1. Result 1');
      expect(result.summary).toContain('2. Result 2');
      expect(result.summary).toContain('3. Result 3');
    }
  });

  it('respects limit parameter', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Answer: '',
        AbstractText: '',
        RelatedTopics: [
          {text: 'Result 1'},
          {text: 'Result 2'},
          {text: 'Result 3'},
          {text: 'Result 4'},
          {text: 'Result 5'},
        ],
      }),
    });

    const result = await engine.execute({query: 'test', limit: 2});

    expect(result.type).toBe('text');
    if (result.type === 'text') {
      expect(result.summary).toContain('1. Result 1');
      expect(result.summary).toContain('2. Result 2');
      expect(result.summary).not.toContain('3. Result 3');
    }
  });

  it('flattens nested topics', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Answer: '',
        AbstractText: '',
        RelatedTopics: [
          {
            topics: [
              {text: 'Nested 1', url: 'https://example.com/n1'},
              {text: 'Nested 2', url: 'https://example.com/n2'},
            ],
          },
          {text: 'Top level', url: 'https://example.com/top'},
        ],
      }),
    });

    const result = await engine.execute({query: 'test'});

    expect(result.type).toBe('text');
    if (result.type === 'text') {
      expect(result.summary).toContain('Nested 1');
      expect(result.summary).toContain('Nested 2');
      expect(result.summary).toContain('Top level');
    }
  });

  it('handles no results gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Answer: '',
        AbstractText: '',
        Definition: '',
        RelatedTopics: [],
      }),
    });

    const result = await engine.execute({query: 'xyznonexistent12345'});

    expect(result.type).toBe('text');
    if (result.type === 'text') {
      expect(result.summary).toMatch(/No instant answer found/);
    }
  });

  it('handles HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const result = await engine.execute({query: 'test'});

    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.errorMessage).toMatch(/status 500/);
    }
  });

  it('handles network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await engine.execute({query: 'test'});

    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.errorMessage).toBe('Network error');
    }
  });

  it('encodes query in URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({Answer: '', AbstractText: '', RelatedTopics: []}),
    });

    await engine.execute({query: 'hello & world'});

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('q=hello%20%26%20world');
  });

  it('produces correct tool definition', () => {
    const def = engine.toToolDefinition();
    expect(def.function.name).toBe('web_search');
    expect(def.function.parameters.required).toContain('query');
    expect(def.function.parameters.properties.query.type).toBe('string');
    expect(def.function.parameters.properties.limit.type).toBe('number');
  });
});
