import {
  formatKbHitsForPrompt,
  MAX_QUOTE_PER_HIT,
  trimToRelevantSentences,
} from '../kbInjection';
import type {KbSearchHit} from '../../store/KnowledgeBaseStore';

const hit = (text: string, cosine = 0.5): KbSearchHit =>
  ({
    docId: 'd1',
    docName: 'notes.md',
    position: 0,
    text,
    score: 1,
    cosine,
  }) as KbSearchHit;

describe('trimToRelevantSentences', () => {
  it('returns short text unchanged', () => {
    expect(trimToRelevantSentences('short text', 'query', 100)).toBe(
      'short text',
    );
  });

  it('head-truncates sentence-less text', () => {
    const code = 'a{b:c};'.repeat(300);
    const out = trimToRelevantSentences(code, 'query', 200);
    expect(out.length).toBe(200); // cap includes the ellipsis
    expect(out.endsWith('...')).toBe(true);
  });

  it('head-truncates when the query has no usable tokens', () => {
    const prose =
      'One sentence here. Another sentence follows. Yet another one appears. ';
    const text = prose.repeat(10);
    const out = trimToRelevantSentences(text, '!!', 200);
    expect(out.endsWith('...')).toBe(true);
  });

  it('keeps query-relevant sentences and drops the rest', () => {
    const filler = 'The weather is mild today and nothing happened. ';
    const relevant = 'The reactor coolant pump failed at 3am.';
    const text = (filler + relevant + ' ').repeat(10).trim();
    const out = trimToRelevantSentences(text, 'reactor coolant pump', 300);
    expect(out).toContain('reactor coolant pump');
    expect(out.length).toBeLessThan(text.length);
  });

  it('never exceeds the char cap', () => {
    const sentences = Array.from(
      {length: 40},
      (_, i) => `Sentence number ${i} mentions the query token.`,
    ).join(' ');
    const out = trimToRelevantSentences(sentences, 'query token', 150);
    expect(out.length).toBeLessThanOrEqual(150);
  });
});

describe('formatKbHitsForPrompt', () => {
  it('returns empty for no hits', () => {
    expect(formatKbHitsForPrompt([], 1000)).toBe('');
  });

  it('quotes each hit under a source header with relevance', () => {
    const out = formatKbHitsForPrompt(
      [hit('alpha beta gamma', 0.62)],
      2000,
      'alpha',
    );
    expect(out).toContain('Knowledge base: notes.md');
    expect(out).toContain('relevance 0.62');
    expect(out).toContain('alpha beta gamma');
  });

  it('caps each individual quote', () => {
    const long = 'Sentence with the answer. '.repeat(200);
    const out = formatKbHitsForPrompt([hit(long)], 50_000, 'answer');
    const quoted = out.split('---\n')[1] ?? '';
    expect(quoted.length).toBeLessThanOrEqual(MAX_QUOTE_PER_HIT + 1);
  });

  it('respects the global budget across hits', () => {
    const long = 'Relevant answer sentence. '.repeat(100);
    const hits = Array.from({length: 6}, () => hit(long, 0.4));
    const out = formatKbHitsForPrompt(hits, 2000, 'answer');
    // The block must fit the budget: intro line + headers + quotes.
    expect(out.length).toBeLessThan(2000 + 100);
    const headerCount = (out.match(/Knowledge base:/g) ?? []).length;
    expect(headerCount).toBeLessThan(6);
  });

  it('prefers query-relevant sentences over head text', () => {
    const text =
      'Unrelated opener that drones on about nothing in particular here. '.repeat(
        30,
      ) + 'The migration took eleven days end to end.';
    const out = formatKbHitsForPrompt([hit(text)], 3000, 'migration days');
    expect(out).toContain('migration took eleven days');
    expect(out).not.toContain('drones on');
  });
});
