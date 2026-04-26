import {RenderHtmlEngine} from '../RenderHtmlEngine';

describe('RenderHtmlEngine', () => {
  const engine = new RenderHtmlEngine();

  it('exposes name "render_html"', () => {
    expect(engine.name).toBe('render_html');
  });

  it('returns an html TalentResult when given html and title', async () => {
    const result = await engine.execute({
      html: '<p>hi</p>',
      title: 'Greeting',
    });
    expect(result.type).toBe('html');
    if (result.type === 'html') {
      expect(result.html).toBe('<p>hi</p>');
      expect(result.title).toBe('Greeting');
      expect(result.summary).toBe('Rendered HTML preview: "Greeting"');
    }
  });

  it('returns undefined title when title arg is omitted', async () => {
    const result = await engine.execute({html: '<p>hi</p>'});
    if (result.type === 'html') {
      expect(result.title).toBeUndefined();
    }
  });

  it('defaults title to "Untitled" in summary when missing', async () => {
    const result = await engine.execute({html: '<p>hi</p>'});
    expect(result.summary).toBe('Rendered HTML preview: "Untitled"');
  });

  it('returns an error TalentResult for missing html', async () => {
    const result = await engine.execute({});
    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.errorMessage).toMatch(/html argument is required/);
    }
  });

  it('returns an error TalentResult for empty html string', async () => {
    const result = await engine.execute({html: ''});
    expect(result.type).toBe('error');
  });

  it('returns an error TalentResult for non-string html', async () => {
    const result = await engine.execute({html: 123 as any});
    expect(result.type).toBe('error');
  });

  it('ignores non-string title values (treats as undefined)', async () => {
    const result = await engine.execute({html: '<p/>', title: 42 as any});
    expect(result.summary).toBe('Rendered HTML preview: "Untitled"');
  });

  it('does not sanitize or mutate the html payload (pass-through)', async () => {
    const raw = '<script>alert(1)</script><style>body{}</style><p>ok</p>';
    const result = await engine.execute({html: raw, title: 'X'});
    if (result.type === 'html') {
      expect(result.html).toBe(raw);
    } else {
      throw new Error('expected html result');
    }
  });

  describe('toToolDefinition', () => {
    it('returns a valid ToolDefinition with correct name', () => {
      const def = engine.toToolDefinition();
      expect(def.type).toBe('function');
      expect(def.function.name).toBe('render_html');
      expect(typeof def.function.description).toBe('string');
      expect(def.function.parameters).toBeDefined();
      expect(def.function.parameters.required).toContain('html');
    });
  });
});
