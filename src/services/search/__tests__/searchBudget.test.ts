import {
  budgetHits,
  budgetPage,
  getCachedHits,
  setCachedHits,
  resetSearchCache,
} from '../searchBudget';
import type {SearchHit, SearchBudget} from '../types';

const hit = (overrides: Partial<SearchHit> = {}): SearchHit => ({
  title: 'Title',
  url: 'https://example.com/a',
  snippet: 'A short snippet.',
  ...overrides,
});

const budget = (overrides: Partial<SearchBudget> = {}): SearchBudget => ({
  maxResults: 3,
  perSnippetChars: 280,
  tokenCeiling: 1000,
  ...overrides,
});

describe('budgetHits', () => {
  it('caps result count to maxResults', () => {
    const hits = [hit(), hit(), hit(), hit(), hit()];
    const out = budgetHits(hits, budget({maxResults: 2}));
    expect(out).toHaveLength(2);
  });

  it('strips markup to plain text but keeps the url verbatim', () => {
    const out = budgetHits(
      [
        hit({
          title: '<b>Bold</b> title',
          snippet: 'See <a href="x">**docs**</a> here',
          url: 'https://example.com/keep?q=1',
        }),
      ],
      budget(),
    );
    expect(out[0].title).toBe('Bold title');
    expect(out[0].snippet).toBe('See docs here');
    expect(out[0].url).toBe('https://example.com/keep?q=1');
  });

  it('truncates snippet on a word boundary, never mid-word', () => {
    const out = budgetHits(
      [hit({snippet: 'alpha beta gamma delta epsilon'})],
      budget({perSnippetChars: 14}),
    );
    // 'alpha beta gam' would be the raw 14-char slice; word boundary backs up.
    expect(out[0].snippet).toBe('alpha beta…');
    expect(out[0].snippet).not.toContain('gam ');
  });

  it('drops trailing hits whole past the token ceiling, never mid-fact', () => {
    const big = 'word '.repeat(100).trim(); // ~500 chars ≈ 125 tokens
    const hits = [
      hit({snippet: big, url: 'https://example.com/1'}),
      hit({snippet: big, url: 'https://example.com/2'}),
      hit({snippet: big, url: 'https://example.com/3'}),
    ];
    const out = budgetHits(
      hits,
      budget({maxResults: 3, perSnippetChars: 600, tokenCeiling: 160}),
    );
    // First hit fits; second would exceed → dropped whole.
    expect(out).toHaveLength(1);
    expect(out[0].snippet).toBe(big);
  });

  it('always keeps at least the first hit even if it exceeds the ceiling', () => {
    const big = 'word '.repeat(200).trim();
    const out = budgetHits(
      [hit({snippet: big})],
      budget({perSnippetChars: 2000, tokenCeiling: 1}),
    );
    expect(out).toHaveLength(1);
  });

  it('preserves publishedAt when present and keeps url on empty snippet', () => {
    const out = budgetHits(
      [hit({snippet: '', publishedAt: '2026-01-01'})],
      budget(),
    );
    expect(out[0].snippet).toBe('');
    expect(out[0].url).toBe('https://example.com/a');
    expect(out[0].publishedAt).toBe('2026-01-01');
  });

  it('truncates space-less CJK without emitting a lone surrogate', () => {
    // No spaces (CJK) so the cut falls back to the char-boundary branch. The
    // emoji at the cut must not be split into a lone high surrogate.
    const snippet = '中文内容😀中文内容';
    // perSnippetChars 5 cuts mid-emoji (the 😀 surrogate pair spans units 4–5),
    // so the raw slice ends on a lone high surrogate the strip must remove.
    const out = budgetHits([hit({snippet})], budget({perSnippetChars: 5}));
    const truncated = out[0].snippet;
    // No unpaired high surrogate (0xD800–0xDBFF) left dangling before the ellipsis.
    const beforeEllipsis = truncated.replace(/…$/, '');
    const lastCode = beforeEllipsis.charCodeAt(beforeEllipsis.length - 1);
    expect(lastCode >= 0xd800 && lastCode <= 0xdbff).toBe(false);
    expect(truncated.endsWith('…')).toBe(true);
  });
});

describe('budgetPage', () => {
  it('keeps leading content and drops the tail on a word boundary', () => {
    const page = {
      url: 'https://example.com/article',
      title: '<h1>Hi</h1>',
      text: 'one two three four five six seven eight nine ten',
    };
    const out = budgetPage(page, 2); // 2 tokens ≈ 8 chars
    expect(out.title).toBe('Hi');
    expect(out.url).toBe(page.url);
    expect(out.text.startsWith('one')).toBe(true);
    expect(out.text.endsWith('…')).toBe(true);
    expect(out.text).not.toContain('ten');
  });

  it('returns full text when it fits the ceiling', () => {
    const page = {url: 'https://example.com/a', text: 'short body'};
    const out = budgetPage(page, 1000);
    expect(out.text).toBe('short body');
  });
});

describe('in-session cache', () => {
  beforeEach(() => resetSearchCache());

  it('returns undefined on a miss', () => {
    expect(getCachedHits('tavily', 'q', 3)).toBeUndefined();
  });

  it('returns cached hits on a hit keyed by provider+query+maxResults', () => {
    const hits = [hit()];
    setCachedHits('tavily', 'mars', 3, hits);
    expect(getCachedHits('tavily', 'mars', 3)).toBe(hits);
    // Different provider / query / count miss.
    expect(getCachedHits('brave', 'mars', 3)).toBeUndefined();
    expect(getCachedHits('tavily', 'moon', 3)).toBeUndefined();
    expect(getCachedHits('tavily', 'mars', 5)).toBeUndefined();
  });

  it('resetSearchCache clears entries', () => {
    setCachedHits('tavily', 'q', 3, [hit()]);
    resetSearchCache();
    expect(getCachedHits('tavily', 'q', 3)).toBeUndefined();
  });

  it('evicts the oldest entry once the cap is exceeded', () => {
    // Cap is 50; insert 51 distinct keys and the first must be evicted.
    for (let i = 0; i < 51; i++) {
      setCachedHits('tavily', `q${i}`, 3, [hit()]);
    }
    expect(getCachedHits('tavily', 'q0', 3)).toBeUndefined();
    expect(getCachedHits('tavily', 'q50', 3)).toBeDefined();
  });
});
