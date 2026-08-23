/**
 * Prompt rendering for knowledge-base retrieval hits.
 *
 * Retrieved excerpts are quoted under a source header so the model can
 * cite which file/chunk a claim came from. Two size controls keep the
 * prefill cost bounded:
 *  - per-hit extractive trimming: only the query-relevant sentences of
 *    a chunk are quoted, not the whole chunk
 *  - a global char budget so retrieval can never crowd out the user's
 *    own text
 */
import type {KbSearchHit} from '../store/KnowledgeBaseStore';

/** Hard cap on total quoted text across all hits. */
export const MAX_QUOTED_CHARS = 3_000;

/** Per-hit quote ceiling after extractive trimming. */
export const MAX_QUOTE_PER_HIT = 900;

const SENTENCE_SPLIT = /(?<=[.!?。！？])\s+|\n+/;
const WORD_SPLIT = /[^\p{L}\p{N}]+/u;

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .split(WORD_SPLIT)
    .filter(w => w.length > 1);

const uniqueTokens = (tokens: string[]): Set<string> => new Set(tokens);

/**
 * Quote only the sentences of `text` that overlap the query. Falls back
 * to head-truncation when the text has no usable sentence structure
 * (code, tables, minified data).
 */
export const trimToRelevantSentences = (
  text: string,
  query: string,
  maxChars: number,
): string => {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  const queryTokens = uniqueTokens(tokenize(query));
  if (queryTokens.size === 0) {
    return `${trimmed.slice(0, Math.max(0, maxChars - 3))}...`;
  }

  const sentences = trimmed
    .split(SENTENCE_SPLIT)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  // Code or table fragments rarely split into sentences; head-truncate.
  if (sentences.length < 3 || sentences.some(s => s.length > maxChars)) {
    return `${trimmed.slice(0, Math.max(0, maxChars - 3))}...`;
  }

  const scored = sentences.map((sentence, index) => {
    const tokens = tokenize(sentence);
    let overlap = 0;
    for (const token of tokens) {
      if (queryTokens.has(token)) {
        overlap += 1;
      }
    }
    return {
      index,
      sentence,
      overlap,
      // Slight recency bias for ordering: later sentences in a chunk
      // often carry the payoff after a build-up.
      score: overlap + index * 0.01,
    };
  });

  // Only sentences with actual query overlap qualify; the bias above
  // must never admit zero-overlap filler on its own.
  const picked = scored
    .filter(s => s.overlap > 0)
    .sort((a, b) => b.score - a.score)
    .reduce(
      (acc, s) => {
        const nextLen =
          acc.reduce((sum, x) => sum + x.sentence.length + 1, 0) +
          s.sentence.length;
        return nextLen <= maxChars ? [...acc, s] : acc;
      },
      [] as typeof scored,
    )
    .sort((a, b) => a.index - b.index);

  if (picked.length === 0) {
    return `${trimmed.slice(0, Math.max(0, maxChars - 3))}...`;
  }
  return picked.map(s => s.sentence).join(' ');
};

export const formatKbHitsForPrompt = (
  hits: KbSearchHit[],
  budgetChars: number,
  query = '',
): string => {
  if (hits.length === 0) {
    return '';
  }

  const parts: string[] = [];
  let used = 0;
  for (const hit of hits) {
    const header =
      `--- Knowledge base: ${hit.docName} (chunk ${hit.position + 1}` +
      `, relevance ${hit.cosine.toFixed(2)}) ---`;
    const remaining = Math.min(
      budgetChars - used - header.length - 2,
      MAX_QUOTE_PER_HIT,
    );
    if (remaining <= 100) {
      break;
    }
    const text = trimToRelevantSentences(hit.text, query, remaining);
    parts.push(`${header}\n${text}`);
    used += header.length + text.length + 2;
  }

  if (parts.length === 0) {
    return '';
  }
  return `Quoted from the local knowledge base for this question:\n\n${parts.join('\n\n')}`;
};
