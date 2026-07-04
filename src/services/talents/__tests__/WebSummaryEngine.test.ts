import {WebSummaryEngine} from '../WebSummaryEngine';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('WebSummaryEngine', () => {
  const engine = new WebSummaryEngine();

  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('exposes name "web_summary"', () => {
    expect(engine.name).toBe('web_summary');
  });

  it('returns error for empty url', async () => {
    const result = await engine.execute({url: ''});
    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.errorMessage).toMatch(/url argument is required/);
    }
  });

  it('returns error for missing url', async () => {
    const result = await engine.execute({});
    expect(result.type).toBe('error');
  });

  it('returns error for non-string url', async () => {
    const result = await engine.execute({url: 42 as any});
    expect(result.type).toBe('error');
  });

  it('returns error for invalid URL', async () => {
    const result = await engine.execute({url: 'not-a-url'});
    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.errorMessage).toMatch(/not valid/);
    }
  });

  it('returns error for unsupported protocol', async () => {
    const result = await engine.execute({url: 'ftp://example.com/file'});
    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.errorMessage).toMatch(/protocol/);
    }
  });

  it('extracts text from HTML response', async () => {
    const html = `
      <html>
        <head>
          <title>Test Page</title>
          <script>var x = 1;</script>
          <style>body { color: red; }</style>
        </head>
        <body>
          <p>This is the first paragraph with enough text to be included.</p>
          <p>This is the second paragraph also with sufficient length.</p>
        </body>
      </html>
    `;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Map([['content-type', 'text/html']]),
      text: async () => html,
    });

    const result = await engine.execute({url: 'https://example.com/article'});

    expect(result.type).toBe('text');
    if (result.type === 'text') {
      expect(result.summary).toContain('Title: Test Page');
      expect(result.summary).toContain('first paragraph');
      expect(result.summary).toContain('second paragraph');
      expect(result.summary).not.toContain('var x = 1');
      expect(result.summary).not.toContain('color: red');
    }
  });

  it('extracts title from HTML', async () => {
    const html = `<html><head><title>My Article Title</title></head><body><p>Content here is long enough to pass the threshold.</p></body></html>`;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Map([['content-type', 'text/html']]),
      text: async () => html,
    });

    const result = await engine.execute({url: 'https://example.com'});

    expect(result.type).toBe('text');
    if (result.type === 'text') {
      expect(result.summary).toContain('Title: My Article Title');
    }
  });

  it('handles HTTP error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: new Map(),
    });

    const result = await engine.execute({url: 'https://example.com/notfound'});

    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.errorMessage).toMatch(/status 404/);
    }
  });

  it('handles non-HTML content type', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Map([['content-type', 'application/pdf']]),
      text: async () => '',
    });

    const result = await engine.execute({url: 'https://example.com/doc.pdf'});

    expect(result.type).toBe('text');
    if (result.type === 'text') {
      expect(result.summary).toMatch(/non-HTML content/);
    }
  });

  it('handles network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

    const result = await engine.execute({url: 'https://example.com'});

    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.errorMessage).toBe('Connection refused');
    }
  });

  it('handles empty page gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Map([['content-type', 'text/html']]),
      text: async () => '<html><body></body></html>',
    });

    const result = await engine.execute({url: 'https://example.com/empty'});

    expect(result.type).toBe('text');
    if (result.type === 'text') {
      expect(result.summary).toMatch(/No readable text/);
    }
  });

  it('truncates long content', async () => {
    const longText = 'A'.repeat(10000);
    const html = `<html><head><title>Long</title></head><body><p>${longText}</p></body></html>`;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Map([['content-type', 'text/html']]),
      text: async () => html,
    });

    const result = await engine.execute({url: 'https://example.com/long'});

    expect(result.type).toBe('text');
    if (result.type === 'text') {
      expect(result.summary).toContain('truncated');
      // Summary should be within reasonable bounds
      expect(result.summary.length).toBeLessThan(10000);
    }
  });

  it('decodes HTML entities', async () => {
    const html = `<html><head><title>Test &amp; Demo</title></head><body><p>The price is &lt; $10 &amp; &gt; $5 for sure here.</p></body></html>`;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Map([['content-type', 'text/html']]),
      text: async () => html,
    });

    const result = await engine.execute({url: 'https://example.com'});

    expect(result.type).toBe('text');
    if (result.type === 'text') {
      expect(result.summary).toContain('Test & Demo');
      expect(result.summary).toContain('< $10 & > $5');
    }
  });

  it('uses meta description as fallback', async () => {
    const html = `<html><head><title>Test</title><meta name="description" content="This is a meta description for testing purposes."></head><body><p>Short</p></body></html>`;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Map([['content-type', 'text/html']]),
      text: async () => html,
    });

    const result = await engine.execute({url: 'https://example.com'});

    expect(result.type).toBe('text');
    if (result.type === 'text') {
      expect(result.summary).toContain('meta description');
    }
  });

  it('produces correct tool definition', () => {
    const def = engine.toToolDefinition();
    expect(def.function.name).toBe('web_summary');
    expect(def.function.parameters.required).toContain('url');
    expect(def.function.parameters.properties.url.type).toBe('string');
  });
});
