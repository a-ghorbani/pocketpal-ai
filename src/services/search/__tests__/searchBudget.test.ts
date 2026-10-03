import {
  budgetHits,
  budgetPage,
  estimateTokens,
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

/** Mirrors the markdown bullet the web_search engine sends to the model. */
const renderHit = (h: SearchHit): string => {
  const date = h.publishedAt ? ` *(${h.publishedAt})*` : '';
  const lines = [`- **${h.title || h.url}**${date}`];
  if (h.snippet) {
    lines.push(`  ${h.snippet}`);
  }
  lines.push(`  <${h.url}>`);
  return lines.join('\n');
};

describe('budgetHits', () => {
  it('caps result count to maxResults', () => {
    const hits = [hit(), hit(), hit(), hit(), hit()];
    const out = budgetHits(hits, budget({maxResults: 2}), renderHit);
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
      renderHit,
    );
    expect(out[0].title).toBe('Bold title');
    expect(out[0].snippet).toBe('See docs here');
    expect(out[0].url).toBe('https://example.com/keep?q=1');
  });

  it('truncates snippet on a word boundary, never mid-word', () => {
    const out = budgetHits(
      [hit({snippet: 'alpha beta gamma delta epsilon'})],
      budget({perSnippetChars: 14}),
      renderHit,
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
      renderHit,
    );
    expect(out).toHaveLength(1);
    expect(out[0].snippet).toBe(big);
  });

  it('charges the ceiling against the rendered menu, not the raw fields', () => {
    // Raw fields ~13 tokens/hit but ~15 once rendered; a ceiling of 27 admits
    // both on the raw estimate, overflowing what the model is actually sent.
    const snippet = 'a'.repeat(30);
    const hits = [
      hit({title: 'T', url: 'https://e.com/1', snippet}),
      hit({title: 'T', url: 'https://e.com/2', snippet}),
    ];
    const out = budgetHits(
      hits,
      budget({maxResults: 3, tokenCeiling: 27}),
      renderHit,
    );

    expect(out).toHaveLength(1);
    const renderedTokens = out.reduce(
      (sum, h) => sum + estimateTokens(renderHit(h)),
      0,
    );
    expect(renderedTokens).toBeLessThanOrEqual(27);
  });

  it('drops even the first hit when it exceeds the ceiling (hostile-payload guard)', () => {
    const big = 'word '.repeat(200).trim();
    const out = budgetHits(
      [hit({snippet: big})],
      budget({perSnippetChars: 2000, tokenCeiling: 1}),
      renderHit,
    );
    expect(out).toHaveLength(0);
  });

  it('clamps an oversized provider title so one field cannot blow the ceiling', () => {
    const hugeTitle = 'word '.repeat(1000).trim();
    const out = budgetHits([hit({title: hugeTitle})], budget(), renderHit);
    expect(out).toHaveLength(1);
    expect(out[0].title.length).toBeLessThanOrEqual(201); // cap + ellipsis
  });

  it('drops a hit with an absurdly long URL instead of truncating it', () => {
    const hugeUrl = `https://example.com/${'x'.repeat(5000)}`;
    const out = budgetHits(
      [hit({url: hugeUrl}), hit({url: 'https://example.com/ok'})],
      budget(),
      renderHit,
    );
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe('https://example.com/ok');
  });

  it('preserves publishedAt when present and keeps url on empty snippet', () => {
    const out = budgetHits(
      [hit({snippet: '', publishedAt: '2026-01-01'})],
      budget(),
      renderHit,
    );
    expect(out[0].snippet).toBe('');
    expect(out[0].url).toBe('https://example.com/a');
    expect(out[0].publishedAt).toBe('2026-01-01');
  });

  it('truncates space-less CJK without emitting a lone surrogate', () => {
    // No spaces (CJK) so the cut falls back to the char-boundary branch. The
    // emoji at the cut must not be split into a lone high surrogate.
    const snippet = '中文内容😀中文内容';
    const out = budgetHits(
      [hit({snippet})],
      budget({perSnippetChars: 5}),
      renderHit,
    );
    const truncated = out[0].snippet;
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

  it('clamps a provider-controlled over-long title', () => {
    const page = {
      url: 'https://example.com/a',
      title: 'word '.repeat(100), // 500 chars, well over the title cap
      text: 'body',
    };
    const out = budgetPage(page, 1000);
    expect(out.title!.length).toBeLessThanOrEqual(201); // cap + ellipsis
    expect(out.title!.endsWith('…')).toBe(true);
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
    // Cap is 50; the 51st distinct key evicts the oldest.
    for (let i = 0; i < 51; i++) {
      setCachedHits('tavily', `q${i}`, 3, [hit()]);
    }
    expect(getCachedHits('tavily', 'q0', 3)).toBeUndefined();
    expect(getCachedHits('tavily', 'q50', 3)).toBeDefined();
  });
});
