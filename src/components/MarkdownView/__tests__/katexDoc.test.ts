import {
  buildKatexDoc,
  clampMeasuredSize,
  escapeHtml,
  getCachedMathSize,
  renderParagraphHtml,
  renderTexToHtml,
  setCachedMathSize,
} from '../katexDoc';
import {KATEX_CSS} from '../katexCss';

describe('katexCss bundle', () => {
  it('inlines woff2 fonts with zero remote loads', () => {
    expect(KATEX_CSS).toContain('@font-face');
    expect(KATEX_CSS.match(/data:font/g)?.length).toBeGreaterThan(0);
    expect(KATEX_CSS).not.toMatch(/url\(http/);
    expect(KATEX_CSS).not.toMatch(/url\(fonts\//);
  });
});

describe('renderTexToHtml', () => {
  it('pre-renders valid TeX', () => {
    const html = renderTexToHtml('\\frac{1}{2}', false);
    expect(html).toContain('katex');
  });

  it('returns undefined for KaTeX errors', () => {
    expect(renderTexToHtml('\\invalidcommand{{{', true)).toBeUndefined();
  });

  it('supports user-defined macros in one pass', () => {
    expect(
      renderTexToHtml('\\newcommand{\\RR}{\\mathbb{R}}\\RR', false),
    ).toContain('katex');
  });

  it('falls back for unsupported macros instead of echoing them', () => {
    // mhchem is not bundled: \ce must become a clean code fallback,
    // not KaTeX's red echo text.
    expect(renderTexToHtml('\\ce{H2O}', false)).toBeUndefined();
  });

  it('still renders through strict warnings', () => {
    expect(renderTexToHtml('a\\\\b', true)).toContain('katex');
  });
});

describe('escapeHtml', () => {
  it('escapes markup characters', () => {
    expect(escapeHtml('<a href="x">&')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;',
    );
  });
});

describe('renderParagraphHtml', () => {
  it('substitutes math with KaTeX and keeps prose', () => {
    const {html, mathCount} = renderParagraphHtml('See $x^2$ ok.');
    expect(mathCount).toBe(1);
    expect(html).toContain('See');
    expect(html).toContain('katex');
    expect(html).toContain('ok.');
    expect(html).not.toContain('ppmath');
  });

  it('preserves bold, links and code spans', () => {
    const {html} = renderParagraphHtml(
      '**Hi** [t](https://e.com) `$notmath$` and $x$.',
    );
    expect(html).toContain('<strong>Hi</strong>');
    expect(html).toContain('href="https://e.com"');
    expect(html).toContain('<code>$notmath$</code>');
    expect(html).toContain('katex');
  });

  it('falls back to code for rejected formulas', () => {
    const {html, mathCount} = renderParagraphHtml('Bad $\\invalidcommand{{$.');
    expect(mathCount).toBe(1);
    expect(html).toContain('<code>');
    expect(html).not.toContain('ppmath');
  });

  it('reports zero math for plain text', () => {
    const {html, mathCount} = renderParagraphHtml('Just $5 and $10.');
    expect(mathCount).toBe(0);
    expect(html).toContain('$5 and $10');
  });
});

describe('buildKatexDoc', () => {
  const colors = {
    text: '#fff',
    background: '#000',
    link: '#00f',
    codeBackground: '#111',
  };

  it('wraps body html with fonts and theme', () => {
    const doc = buildKatexDoc('<p>hi</p>', colors);
    expect(doc).toContain('<p>hi</p>');
    expect(doc).toContain('@font-face');
    expect(doc).toContain('#fff');
    expect(doc).toContain('#00f');
    expect(doc).toContain('charset="utf-8"');
  });

  it('centers display math on request', () => {
    expect(buildKatexDoc('x', colors, {center: true})).toContain(
      'text-align:center',
    );
  });
});

describe('measured size helpers', () => {
  it('clamps to min, max and width modes', () => {
    expect(
      clampMeasuredSize(
        {height: 5, width: 10},
        {minHeight: 30, maxWidth: 300, fullWidth: false},
      ),
    ).toEqual({height: 30, width: 10});
    expect(
      clampMeasuredSize(
        {height: 9999, width: 9999},
        {minHeight: 30, maxWidth: 300, fullWidth: true},
      ).height,
    ).toBeLessThanOrEqual(480);
  });

  it('caches and returns sizes', () => {
    expect(getCachedMathSize('katex-doc-test-key')).toBeUndefined();
    setCachedMathSize('katex-doc-test-key', {height: 42, width: 43});
    expect(getCachedMathSize('katex-doc-test-key')).toEqual({
      height: 42,
      width: 43,
    });
  });
});
