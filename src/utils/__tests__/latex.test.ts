import {splitTextWithMath} from '../latex';

describe('splitTextWithMath', () => {
  it('returns no segments for empty input', () => {
    expect(splitTextWithMath('')).toEqual([]);
  });

  it('keeps plain text as a single text segment', () => {
    const segments = splitTextWithMath('Hello world');
    expect(segments).toEqual([
      {
        type: 'text',
        content: 'Hello world',
        displayMode: false,
        raw: 'Hello world',
      },
    ]);
  });

  it('parses block $$...$$ as display math', () => {
    const segments = splitTextWithMath('Solve $$x^2 + 1$$ now');
    expect(segments.map(s => s.type)).toEqual(['text', 'math', 'text']);
    expect(segments[1]).toMatchObject({
      type: 'math',
      content: 'x^2 + 1',
      displayMode: true,
      raw: '$$x^2 + 1$$',
    });
  });

  it('parses the docs example from #138', () => {
    const segments = splitTextWithMath(
      'Input: $$\\frac{dx}{dt} = \\alpha x + \\beta$$',
    );
    expect(segments).toHaveLength(2);
    expect(segments[1]).toMatchObject({
      type: 'math',
      displayMode: true,
      content: '\\frac{dx}{dt} = \\alpha x + \\beta',
    });
  });

  it('parses \\[...\\] as display math', () => {
    const segments = splitTextWithMath('See \\[a^2 + b^2\\] here');
    expect(segments[1]).toMatchObject({
      type: 'math',
      content: 'a^2 + b^2',
      displayMode: true,
    });
  });

  it('parses \\(...\\) as inline math', () => {
    const segments = splitTextWithMath('Inline \\(E=mc^2\\) done');
    expect(segments[1]).toMatchObject({
      type: 'math',
      content: 'E=mc^2',
      displayMode: false,
    });
  });

  it('supports multiline block math', () => {
    const segments = splitTextWithMath('$$\n\\int_0^1 x dx\n$$');
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({type: 'math', displayMode: true});
  });

  it('leaves unclosed delimiters as text (streaming safety)', () => {
    for (const raw of ['Hello $$x^2', 'See \\[abc', 'Inline \\(xyz']) {
      const segments = splitTextWithMath(raw);
      expect(segments.every(s => s.type === 'text')).toBe(true);
      expect(segments.map(s => s.raw).join('')).toBe(raw);
    }
  });

  it('ignores empty math delimiters', () => {
    const segments = splitTextWithMath('Empty $$$$ here');
    expect(segments.every(s => s.type === 'text')).toBe(true);
  });

  it('does not treat single dollars (currency) as math', () => {
    const raw = 'It costs $5 and $10 total';
    const segments = splitTextWithMath(raw);
    expect(segments.every(s => s.type === 'text')).toBe(true);
  });

  it('ignores escaped $$ delimiters', () => {
    const segments = splitTextWithMath('Escaped \\$$not math\\$$ here');
    expect(segments.every(s => s.type === 'text')).toBe(true);
  });

  it('never parses math inside fenced code blocks', () => {
    const raw = '```\n$$x^2$$\n```';
    const segments = splitTextWithMath(raw);
    expect(segments.every(s => s.type === 'text')).toBe(true);
    expect(segments.map(s => s.raw).join('')).toBe(raw);
  });

  it('treats an unclosed fence as verbatim text', () => {
    const raw = '```\n$$x^2$$ still code';
    const segments = splitTextWithMath(raw);
    expect(segments.every(s => s.type === 'text')).toBe(true);
  });

  it('never parses math inside inline code', () => {
    const raw = 'Use `$$x^2$$` for math';
    const segments = splitTextWithMath(raw);
    expect(segments.every(s => s.type === 'text')).toBe(true);
  });

  it('parses multiple formulas in order', () => {
    const segments = splitTextWithMath('$$a$$ and \\(b\\) and \\[c\\]');
    expect(segments.map(s => s.type)).toEqual([
      'math',
      'text',
      'math',
      'text',
      'math',
    ]);
    expect(segments.map(s => s.content)).toEqual([
      'a',
      ' and ',
      'b',
      ' and ',
      'c',
    ]);
  });

  it('round-trips: concatenated raws equal the input', () => {
    const raw =
      'Hi $$x$$ code `\\(y\\)` fence\n```\n\\[z\\]\n```\nTail \\(w\\) $$v$$';
    const segments = splitTextWithMath(raw);
    expect(segments.map(s => s.raw).join('')).toBe(raw);
  });

  it('renders every formula without a cap', () => {
    const formulas = Array.from({length: 25}, (_, i) => `$$x_{${i}}$$`).join(
      '\n\n',
    );
    const segments = splitTextWithMath(formulas);
    expect(segments.filter(s => s.type === 'math')).toHaveLength(25);
  });

  describe('single-dollar inline math', () => {
    it('parses $...$ as inline math', () => {
      const segments = splitTextWithMath('The value $x^2$ here');
      expect(segments.map(s => s.type)).toEqual(['text', 'math', 'text']);
      expect(segments[1]).toMatchObject({
        type: 'math',
        content: 'x^2',
        displayMode: false,
        raw: '$x^2$',
      });
    });

    it('parses the screenshot cases', () => {
      for (const tex of [
        'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
        "f'(x) = 3x^2 - 4x + 1",
        '\\det(A) = ad - bc',
        '2 \\times 2',
        'z = a + bi',
        'i',
        '\\lim_{n \\to \\infty} a_n',
      ]) {
        const segments = splitTextWithMath(`See $${tex}$ ok`);
        expect(segments[1]).toMatchObject({type: 'math', content: tex});
      }
    });

    it('keeps currency pairs as text', () => {
      for (const raw of [
        'It costs $5 and $10 total',
        'Price: $5.00',
        '$100 or $200?',
        '3$4$',
      ]) {
        const segments = splitTextWithMath(raw);
        expect(segments.every(s => s.type === 'text')).toBe(true);
        expect(segments.map(s => s.raw).join('')).toBe(raw);
      }
    });

    it('still finds math after a currency span', () => {
      const segments = splitTextWithMath('$5 and $x$');
      expect(segments.map(s => s.type)).toEqual(['text', 'math']);
      expect(segments[0].raw).toBe('$5 and ');
      expect(segments[1]).toMatchObject({content: 'x'});
    });

    it('renders spaced dollars for unambiguous math', () => {
      // Model style: padded delimiters with real TeX or short symbols.
      for (const [raw, expected] of [
        ['See $ \\rho $ ok', '\\rho'],
        ['See $ s = \\rho $ ok', 's = \\rho'],
        ['See $ i $ ok', 'i'],
        ['See $ x$ ok', 'x'],
        ['See $x $ ok', 'x'],
        ['For $ \\text{Re}(s) > 1 $ holds', '\\text{Re}(s) > 1'],
      ] as Array<[string, string]>) {
        const segments = splitTextWithMath(raw);
        const math = segments.find(s => s.type === 'math');
        expect(math).toMatchObject({content: expected, displayMode: false});
      }
    });

    it('renders the Riemann screenshot shapes', () => {
      // Transcribed from on-device model output (spaced single dollars).
      for (const [raw, expected] of [
        ['for $ \\text{Re}(s) > 1 $.', '\\text{Re}(s) > 1'],
        ['numbers $ s = \\rho $ such', 's = \\rho'],
        ['where $ 0 < \\text{Re}(s) < 1 $.', '0 < \\text{Re}(s) < 1'],
        ['at $ s = -2, -4, -6, \\dots $.', 's = -2, -4, -6, \\dots'],
        [
          'line $ \\text{Re}(s) = \\frac{1}{2} $.',
          '\\text{Re}(s) = \\frac{1}{2}',
        ],
      ] as Array<[string, string]>) {
        const math = splitTextWithMath(raw).find(s => s.type === 'math');
        expect(math).toMatchObject({content: expected, displayMode: false});
      }
    });
    it('rejects spaced dollars for prose and currency', () => {
      for (const raw of [
        'A $  $ B',
        'A $ see above $ B',
        'It costs $ 5 $ total',
        'It costs $5 and $10 total',
      ]) {
        expect(splitTextWithMath(raw).every(s => s.type === 'text')).toBe(true);
      }
    });

    it('rejects escaped dollars', () => {
      const segments = splitTextWithMath('Cost \\$5 and \\$x\\$');
      expect(segments.every(s => s.type === 'text')).toBe(true);
    });

    it('leaves unclosed single dollars as text', () => {
      const raw = 'Answer $x^2 + 1';
      const segments = splitTextWithMath(raw);
      expect(segments.every(s => s.type === 'text')).toBe(true);
    });

    it('parses multiple inline formulas in order', () => {
      const segments = splitTextWithMath('$a$ plus $b$');
      expect(segments.map(s => s.type)).toEqual(['math', 'text', 'math']);
    });

    it('keeps $$ blocks as display math, not two singles', () => {
      const segments = splitTextWithMath('$$x$$');
      expect(segments).toHaveLength(1);
      expect(segments[0]).toMatchObject({type: 'math', displayMode: true});
    });

    it('never lets single-$ swallow a $$ block', () => {
      const segments = splitTextWithMath('$a $$b$$ c$');
      const kinds = segments.map(s => s.type);
      // The $$ block must survive as display math.
      expect(kinds).toContain('math');
      const block = segments.find(
        s => s.type === 'math' && s.displayMode && s.content === 'b',
      );
      expect(block).toBeTruthy();
      expect(segments.map(s => s.raw).join('')).toBe('$a $$b$$ c$');
    });

    it('handles trailing punctuation after the closer', () => {
      const segments = splitTextWithMath('Result $x^2$, done ($y$).');
      expect(segments.filter(s => s.type === 'math')).toHaveLength(2);
    });

    it('does not parse math inside inline code with single dollars', () => {
      const raw = 'Use `$x$` here';
      expect(splitTextWithMath(raw).every(s => s.type === 'text')).toBe(true);
    });
  });

  describe('tables', () => {
    const table = '| A | B |\n|---|---|\n| $x$ | 1 |\n| 2 | $y$ |\n\nAfter $z$';

    it('leaves math inside table rows raw', () => {
      const segments = splitTextWithMath(table);
      const raws = segments.map(s => s.raw).join('');
      expect(raws).toBe(table);
      // No math segment starts inside the table (before "After").
      const tablePart = table.split('\n\n')[0];
      const mathInTable = segments.filter(
        s => s.type === 'math' && tablePart.includes(s.raw),
      );
      expect(mathInTable).toHaveLength(0);
    });

    it('still parses math outside the table', () => {
      const segments = splitTextWithMath(table);
      const tail = segments.find(s => s.type === 'math');
      expect(tail).toMatchObject({content: 'z', displayMode: false});
    });

    it('does not mistake absolute values for tables', () => {
      const segments = splitTextWithMath('Norm $$|x| + |y|$$ end');
      expect(segments[1]).toMatchObject({
        type: 'math',
        content: '|x| + |y|',
        displayMode: true,
      });
    });

    it('does not mistake pipes without a delimiter row for tables', () => {
      const segments = splitTextWithMath('Either $a$ | or $b$');
      expect(segments.filter(s => s.type === 'math')).toHaveLength(2);
    });
  });

  describe('math fences (GitHub ```math convention)', () => {
    it('renders ```math as display math without the markers', () => {
      const segments = splitTextWithMath('See:\n```math\n\\sqrt{3}\n```\ndone');
      expect(segments.map(s => s.type)).toEqual(['text', 'math', 'text']);
      expect(segments[1]).toMatchObject({
        type: 'math',
        content: '\\sqrt{3}',
        displayMode: true,
      });
    });

    it('accepts latex, tex and katex tags in any case, both markers', () => {
      for (const tag of ['latex', 'TEX', 'katex', 'Math']) {
        const segments = splitTextWithMath(`\`\`\`${tag}\nx\n\`\`\``);
        expect(segments[0]).toMatchObject({type: 'math', content: 'x'});
      }
      const tilde = splitTextWithMath('~~~math\ny\n~~~');
      expect(tilde[0]).toMatchObject({type: 'math', content: 'y'});
    });

    it('leaves untagged and empty math fences as text', () => {
      expect(
        splitTextWithMath('```python\n$x$\n```').every(s => s.type === 'text'),
      ).toBe(true);
      expect(
        splitTextWithMath('```math\n\n```').every(s => s.type === 'text'),
      ).toBe(true);
    });

    it('survives unclosed math fences without crashing', () => {
      const raw = '```math\n\\sqrt{3}';
      const segments = splitTextWithMath(raw);
      expect(segments.map(s => s.raw).join('')).toBe(raw);
    });
  });

  describe('double-escaped delimiters', () => {
    it('collapses \\\\( \\\\) to inline math', () => {
      const segments = splitTextWithMath('Value \\\\(x\\\\) here');
      expect(segments.map(s => s.type)).toEqual(['text', 'math', 'text']);
      expect(segments[1]).toMatchObject({content: 'x', displayMode: false});
    });

    it('collapses \\\\[ \\\\] to display math', () => {
      const segments = splitTextWithMath('Value \\\\[a\\\\] here');
      expect(segments[1]).toMatchObject({content: 'a', displayMode: true});
    });

    it('documents the code-span wart explicitly', () => {
      // Normalization also touches code spans; showing `\(` instead of
      // `\\(` there is the accepted rarer wart.
      const segments = splitTextWithMath('Use `\\\\(` here');
      expect(segments.every(s => s.type === 'text')).toBe(true);
      expect(segments.map(s => s.raw).join('')).toBe('Use `\\(` here');
    });
  });
});
