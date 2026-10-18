import {estimateDocTokens} from '../estimate';
import {documentKey} from '../render';
import {
  clearDocumentIndexCache,
  retrieveExcerpts,
  terms,
  type RetrieveInput,
} from '../retrieve';
import type {DocumentTexts} from '../store';
import {excerptFloor} from '../plan';
import {EXCERPT_K, PASSAGE_MAX_TOKENS, type DocumentRef} from '../types';

const doc = (id: string, extra: Partial<DocumentRef> = {}): DocumentRef => ({
  id: `${id}-00000000`,
  name: `${id}.pdf`,
  kind: 'pdf',
  byteSize: 1,
  pageCount: 50,
  charCount: 0,
  tokenEstimate: 60000,
  mode: 'searched',
  ...extra,
});

const filler = (page: number) =>
  `Page ${page} describes the general architecture of the system and its components in plain words.`;

const pagesWith = (special: Record<number, string>, count = 50) =>
  Array.from({length: count}, (_, i) => special[i + 1] ?? filler(i + 1));

const run = (
  refs: Array<[DocumentRef, string[]]>,
  input: Partial<RetrieveInput> = {},
) => {
  const texts: DocumentTexts = new Map(
    refs.map(([ref, pages]) => [documentKey(ref), pages]),
  );
  return retrieveExcerpts({
    query: 'churn',
    searchedRefs: refs.map(([ref]) => ref),
    texts,
    excerptBudget: 2048,
    ...input,
  });
};

beforeEach(() => clearDocumentIndexCache());

describe('terms', () => {
  it('lower-cases word runs and bigrams CJK', () => {
    expect(terms('Churn-rate 2024!')).toEqual(['churn', 'rate', '2024']);
    expect(terms('顧客離反')).toEqual(['顧客', '客離', '離反']);
  });

  it('normalises terms so composed and decomposed forms match', () => {
    expect(terms('cafe\u0301')).toEqual(terms('caf\u00e9'));
    expect(terms('\u0958')).toEqual(terms('\u0915\u093c'));
  });

  it('keeps combining marks inside a Devanagari word', () => {
    expect(terms('हिन्दी भाषा')).toEqual(['हिन्दी', 'भाषा']);
  });

  it('bigrams Thai including its vowel and tone marks', () => {
    expect(terms('ที่นี่')).toEqual(['ที', 'ี่', '่น', 'นี', 'ี่']);
  });
});

describe('retrieveExcerpts', () => {
  const report = doc('report');

  it('returns at most five excerpts within the budget', async () => {
    const pages = pagesWith(
      Object.fromEntries(
        Array.from({length: 20}, (_, i) => [
          i + 2,
          `Churn rose on page ${i + 2}. ${filler(i + 2)}`,
        ]),
      ),
    );
    const result = await run([[report, pages]]);
    expect(result.kind).toBe('excerpts');
    if (result.kind !== 'excerpts') {
      return;
    }
    expect(result.excerpts.length).toBeLessThanOrEqual(EXCERPT_K);
    expect(result.excerpts.length).toBeGreaterThan(0);
    const used = result.excerpts
      .flatMap(e => e.passages)
      .reduce((sum, p) => sum + estimateDocTokens(p.text), 0);
    expect(used).toBeLessThanOrEqual(2048);
  });

  it('ranks an explicitly mentioned page first', async () => {
    const result = await run(
      [[report, pagesWith({37: 'Totally unrelated.'})]],
      {
        query: 'and page 37?',
      },
    );
    expect(result.kind).toBe('excerpts');
    if (result.kind === 'excerpts') {
      expect(result.excerpts.some(e => e.passages[0].page === 37)).toBe(true);
    }
  });

  it('does not treat "Seite 12" as a page mention', async () => {
    const result = await run([[report, pagesWith({12: 'Zwölf.'})]], {
      query: 'Seite 12',
    });
    expect(result).toEqual({kind: 'noMatch'});
  });

  it('reports no match when nothing scores', async () => {
    expect(await run([[report, pagesWith({})]], {query: 'zebra'})).toEqual({
      kind: 'noMatch',
    });
  });

  it('falls back to the previous question only when the new one finds little', async () => {
    const pages = pagesWith({4: 'Churn was high in spring.'});
    const result = await run([[report, pages]], {
      query: 'explain more',
      previousQuery: 'why churn?',
    });
    expect(result.kind).toBe('excerpts');
    if (result.kind === 'excerpts') {
      expect(result.excerpts[0].passages.some(p => p.page === 4)).toBe(true);
    }
  });

  it('pairs a passage with its same-page neighbour and degrades to one passage', async () => {
    const longPage = Array.from(
      {length: 12},
      (_, i) => `Paragraph ${i} about churn and retention in detail here.`,
    ).join('\n\n');
    const pages = pagesWith({5: longPage + '\n\n' + longPage + longPage});
    const roomy = await run([[report, pages]]);
    expect(roomy.kind).toBe('excerpts');
    if (roomy.kind === 'excerpts') {
      expect(roomy.excerpts.some(e => e.passages.length === 2)).toBe(true);
    }
    const tight = await run([[report, pages]], {excerptBudget: 330});
    if (tight.kind === 'excerpts') {
      expect(tight.excerpts).toHaveLength(1);
      expect(tight.excerpts[0].passages).toHaveLength(1);
    }
  });

  it('cites a shared page under each range key', async () => {
    const all = doc('shared');
    const narrowed = doc('shared', {pageRange: {from: 3, to: 5}});
    const pages = pagesWith({3: 'Churn detail on page three.'}, 5);
    const result = await run([
      [all, pages],
      [narrowed, pages.slice(2, 5)],
    ]);
    if (result.kind === 'excerpts') {
      const third = result.excerpts.filter(e => e.passages[0].page === 3);
      expect(third.map(e => e.passages[0].rangeKey).sort()).toEqual([
        `${all.id}:3-5`,
        `${all.id}:all`,
      ]);
    }
  });

  it('excludes missing documents', async () => {
    const gone = doc('gone');
    const result = await retrieveExcerpts({
      query: 'churn',
      searchedRefs: [gone],
      texts: new Map([[documentKey(gone), 'missing']]),
      excerptBudget: 2048,
    });
    expect(result).toEqual({kind: 'noMatch'});
  });

  it('drops tail excerpts when the exact count is larger, keeping one', async () => {
    const pages = pagesWith(
      Object.fromEntries(
        Array.from({length: 10}, (_, i) => [i + 1, `Churn note ${i}.`]),
      ),
    );
    const measure = jest.fn(async () => 99999);
    const result = await run([[report, pages]], {measure});
    expect(result.kind === 'excerpts' && result.excerpts).toHaveLength(1);
    expect(measure).toHaveBeenCalled();
  });

  it('is deterministic with a cold or warm cache, and after eviction', async () => {
    const pages = pagesWith({7: 'Churn spiked.', 9: 'Churn eased.'});
    const cold = await run([[report, pages]]);
    const warm = await run([[report, pages]]);
    clearDocumentIndexCache();
    const rebuilt = await run([[report, pages]]);
    expect(warm).toEqual(cold);
    expect(rebuilt).toEqual(cold);
  });

  it('orders excerpts by document, then page', async () => {
    const a = doc('a');
    const b = doc('b');
    const result = await run([
      [a, pagesWith({9: 'churn churn churn'})],
      [b, pagesWith({2: 'churn churn churn churn'})],
    ]);
    if (result.kind === 'excerpts') {
      expect(result.excerpts.map(e => e.ref.name)).toEqual(['a.pdf', 'b.pdf']);
    }
  });
});

describe('budget at the plan floor', () => {
  it('selects one full-size passage when the budget equals the floor', async () => {
    const report = doc('floor');
    let page = '';
    while (estimateDocTokens(`${page} churn`) <= PASSAGE_MAX_TOKENS) {
      page = `${page} churn`.trim();
    }
    expect(estimateDocTokens(page)).toBe(PASSAGE_MAX_TOKENS);

    const result = await run([[report, [page]]], {
      excerptBudget: excerptFloor([report]),
    });

    expect(result.kind).toBe('excerpts');
    expect(result.kind === 'excerpts' && result.excerpts).toHaveLength(1);
  });
});

describe('unicode normalisation', () => {
  it('matches a composed query against decomposed document text', async () => {
    const report = doc('nfd');
    const result = await run(
      [[report, ['The cafe\u0301 opened late.', 'Nothing here.']]],
      {
        query: 'caf\u00e9',
      },
    );
    expect(result.kind).toBe('excerpts');
    if (result.kind === 'excerpts') {
      expect(result.excerpts[0].passages[0].page).toBe(1);
    }
  });
});
