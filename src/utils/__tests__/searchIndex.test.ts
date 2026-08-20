import {
  INDEXED_CHAR_BUDGET,
  __cacheStats,
  __resetCache,
  buildSearchIndex,
  countMatches,
  findMatchRuns,
  getSearchIndex,
  highlightMatches,
} from '../searchIndex';

describe('buildSearchIndex', () => {
  // Every offset downstream assumes this. Breaking it silently misplaces
  // every <mark> after the offending character.
  const expectAligned = (markdown: string) => {
    for (const segment of buildSearchIndex(markdown).segments) {
      expect(segment.spans).toHaveLength(segment.text.length * 2);
    }
  };

  it.each([
    ['plain prose', 'hello world'],
    ['escaped entities', "Tom & Jerry, don't <stop>"],
    ['decodable named entity', 'caf&eacute; au lait'],
    ['undecodable named entity', 'a &thetasym; b'],
    ['numeric entity', 'em &#8212; dash'],
    ['astral numeric entity', 'grin &#128512; here'],
    ['literal emoji', 'grin 😀 here'],
    ['out-of-range numeric entity', 'a &#1114112; b'],
    ['out-of-range hex entity', 'a &#x110000; b'],
    ['inline markup', 'a **b** `c` [d](https://e.dev)'],
    ['block markup', '# H\n\n- one\n- two\n\n> quote'],
  ])('keeps text and spans 1:1 for %s', (_label, markdown) => {
    expectAligned(markdown);
  });
});

describe('undecodable entities', () => {
  it('are left untouched in the output', () => {
    const source = 'a &thetasym; b';
    expect(highlightMatches(source, 'zzz')).toBe(`<p>${source}</p>\n`);
  });

  it('do not shift the marks around them', () => {
    expect(highlightMatches('a &thetasym; batch', 'batch')).toBe(
      '<p>a &thetasym; <mark>batch</mark></p>\n',
    );
  });
});

describe('malformed numeric entities', () => {
  // String.fromCodePoint throws above U+10FFFF and this runs inside render.
  // marked passes these two through unescaped, so they reach the decoder.
  it.each(['a &#1114112; batch', 'a &#x110000; batch'])(
    'does not throw and only inserts tags for %s',
    source => {
      expect(() => highlightMatches(source, 'zzz')).not.toThrow();
      const untouched = highlightMatches(source, 'zzz');
      expect(highlightMatches(source, 'batch')).toBe(
        untouched.replace('batch', '<mark>batch</mark>'),
      );
    },
  );
});

describe('astral characters', () => {
  it('do not shift the marks around them', () => {
    expect(highlightMatches('grin &#128512; batch', 'batch')).toBe(
      '<p>grin &#128512; <mark>batch</mark></p>\n',
    );
    expect(highlightMatches('grin 😀 batch', 'batch')).toBe(
      '<p>grin 😀 <mark>batch</mark></p>\n',
    );
  });

  it('marks the whole entity when matched through its decoded form', () => {
    expect(highlightMatches('a &#128512; b', '😀')).toBe(
      '<p>a <mark>&#128512;</mark> b</p>\n',
    );
  });
});

describe('cache', () => {
  beforeEach(__resetCache);
  afterAll(__resetCache);

  it('returns consistent results for a repeated source', () => {
    const source = 'caf&eacute; and more café';
    const first = highlightMatches(source, 'café');
    expect(highlightMatches(source, 'café')).toBe(first);
    expect(countMatches(source, 'café')).toBe(2);
  });

  it('reuses the index for a repeated source', () => {
    const source = 'the quick brown fox';
    expect(getSearchIndex(source)).toBe(getSearchIndex(source));
    expect(__cacheStats().entries).toBe(1);
  });

  // The bound is on indexed characters, not entry count: cost scales with
  // message length, so entries alone say nothing about what is held.
  it('evicts until the span budget is respected', () => {
    const chunk = 'photosynthesis splits water and reduces carbon dioxide. '
      .repeat(100)
      .trim();
    const inserted = 300;
    expect(inserted * chunk.length).toBeGreaterThan(INDEXED_CHAR_BUDGET);

    for (let i = 0; i < inserted; i++) {
      getSearchIndex(`${chunk} ${i}`);
    }
    const {entries, chars} = __cacheStats();
    expect(chars).toBeLessThanOrEqual(INDEXED_CHAR_BUDGET);
    expect(entries).toBeLessThan(inserted);
    expect(entries).toBeGreaterThan(0);
  });

  it('does not build or retain a span map when the query is empty', () => {
    highlightMatches('some rendered assistant reply', '');
    expect(__cacheStats()).toEqual({entries: 0, chars: 0});
  });
});

describe('<pre> accounting', () => {
  it('excludes fenced code', () => {
    expect(countMatches('```\nconst amp = 1;\n```', 'amp')).toBe(0);
  });

  // A self-closing <pre/> has no closing tag; counting it would leak preDepth
  // and silently disable search for the rest of the message.
  it('does not let a self-closing <pre/> disable the rest of the message', () => {
    expect(
      highlightMatches('<pre/>hello world and more hello', 'hello'),
    ).toContain('<mark>hello</mark> world and more <mark>hello</mark>');
    expect(countMatches('<pre/>hello world and more hello', 'hello')).toBe(2);
  });

  it('keeps later blocks searchable after a self-closing <pre/>', () => {
    expect(countMatches('start\n\n<pre/>\n\nhello world', 'hello')).toBe(1);
  });

  it('recovers from a stray closing </pre>', () => {
    expect(countMatches('</pre>hello world', 'hello')).toBe(1);
  });
});

describe('undecodable entities are not matchable by their spelling', () => {
  it.each([
    ['a &thetasym; b', 'thetasym'],
    ['Tom & Jerry', 'amp'],
  ])('%s does not match %s', (source, query) => {
    expect(countMatches(source, query)).toBe(0);
    expect(highlightMatches(source, query)).not.toContain('<mark>');
  });
});

describe('block boundaries', () => {
  it('does not match across a <details>/<summary> boundary', () => {
    const html = highlightMatches(
      '<details><summary>Foo</summary>bar</details>',
      'foobar',
    );
    expect(html).not.toContain('<mark>');
  });
});

describe('count and runs', () => {
  // countMatches counts occurrences; a single occurrence can emit several
  // <mark> runs when it spans inline markup. Asserting marks === count only
  // holds for markup-free text, so assert the property that always holds.
  it('counts occurrences, not emitted runs', () => {
    const source = 'hello **world** here';
    expect(countMatches(source, 'hello world')).toBe(1);
    expect(
      findMatchRuns(getSearchIndex(source), 'hello world')[0],
    ).toHaveLength(2);
    expect(
      (highlightMatches(source, 'hello world').match(/<mark>/g) || []).length,
    ).toBe(2);
  });
});

describe('active match', () => {
  const source = 'cell and cell and cell';

  it('marks only the named occurrence as active', () => {
    expect(highlightMatches(source, 'cell', 1)).toBe(
      '<p><mark>cell</mark> and <mark class="search-active">cell</mark> and ' +
        '<mark>cell</mark></p>\n',
    );
  });

  it('marks nothing as active when no ordinal is given', () => {
    expect(highlightMatches(source, 'cell')).not.toContain('search-active');
  });

  it('ignores an ordinal that is out of range', () => {
    expect(highlightMatches(source, 'cell', 9)).not.toContain('search-active');
  });

  // A match split by inline markup emits several runs; all of them belong to
  // the same occurrence, so all of them carry the active class.
  it('marks every run of an active match that spans inline markup', () => {
    expect(highlightMatches('hello **world** here', 'hello world', 0)).toBe(
      '<p><mark class="search-active">hello </mark><strong>' +
        '<mark class="search-active">world</mark></strong> here</p>\n',
    );
  });
});
