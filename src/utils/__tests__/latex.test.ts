import {
  MAX_MATH_PER_MESSAGE,
  mathFallbackMarkdown,
  splitTextWithMath,
} from '../latex';

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
    const raw = '```latex\n$$x^2$$\n```';
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

  it('exposes a memory cap constant for the renderer', () => {
    expect(MAX_MATH_PER_MESSAGE).toBe(20);
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

    it('rejects space-adjacent dollars', () => {
      for (const raw of ['A $ x$ B', 'A $x $ B', 'A $  $ B']) {
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

  describe('mathFallbackMarkdown', () => {
    it('wraps block math as a tex code fence', () => {
      expect(mathFallbackMarkdown(true, '$$x$$')).toBe('```tex\n$$x$$\n```');
    });

    it('wraps inline math as a code span', () => {
      expect(mathFallbackMarkdown(false, '$x$')).toBe('`$x$`');
    });

    it('strips backticks so the fallback cannot break', () => {
      expect(mathFallbackMarkdown(false, '$a`b$')).toBe('`$ab$`');
    });
  });
});
