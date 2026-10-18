import {chunkDocument, type Passage} from './chunk';
import {estimateDocTokens} from './estimate';
import {EXCERPT_LEAD_TOKENS, excerptCost} from './plan';
import {documentKey} from './render';
import type {DocumentTexts} from './store';
import {
  CHUNKER_VERSION,
  EXCERPT_K,
  EXCERPT_MAX_PASSAGES,
  type DocumentRef,
} from './types';

export interface Excerpt {
  ref: DocumentRef;
  /** One passage, or two adjacent passages of the same page, in page order. */
  passages: Passage[];
}

export type ExcerptResult =
  | {kind: 'excerpts'; excerpts: Excerpt[]}
  | {kind: 'noMatch'};

interface PassageIndex {
  ref: DocumentRef;
  passages: Passage[];
  termFrequencies: Map<string, number>[];
  lengths: number[];
  chars: number;
}

interface CorpusEntry {
  index: PassageIndex;
  /** Attach order of the document in the chat. */
  docOrder: number;
}

export interface ScoredPassage {
  entry: CorpusEntry;
  position: number;
  score: number;
}

/** Ranks passages for a query; BM25 now, embeddings may join later. */
export interface Retriever {
  rank(query: string, corpus: CorpusEntry[]): ScoredPassage[];
}

const DENSE_RUN = /[฀-๿぀-ヿ㐀-䶿一-鿿豈-﫿가-힯ᄀ-ᇿ㄰-㆏\u{20000}-\u{2fa1f}]+/u;

export const terms = (text: string): string[] => {
  const result: string[] = [];
  for (const [run] of text
    .normalize('NFC')
    .toLowerCase()
    .matchAll(/[\p{L}\p{M}\p{N}]+/gu)) {
    for (const segment of run.split(new RegExp(`(${DENSE_RUN.source})`, 'u'))) {
      if (!segment) {
        continue;
      }
      if (!DENSE_RUN.test(segment)) {
        result.push(segment);
        continue;
      }
      const chars = [...segment];
      if (chars.length === 1) {
        result.push(segment);
      }
      for (let i = 0; i + 1 < chars.length; i++) {
        result.push(chars[i] + chars[i + 1]);
      }
    }
  }
  return result;
};

const K1 = 1.2;
const B = 0.75;

const documentFrequencies = (corpus: CorpusEntry[]) => {
  const df = new Map<string, number>();
  for (const {index} of corpus) {
    for (const tf of index.termFrequencies) {
      for (const term of tf.keys()) {
        df.set(term, (df.get(term) ?? 0) + 1);
      }
    }
  }
  return df;
};

export const bm25Retriever: Retriever = {
  rank(query, corpus) {
    const queryTerms = [...new Set(terms(query))];
    const total = corpus.reduce((sum, e) => sum + e.index.passages.length, 0);
    if (total === 0 || queryTerms.length === 0) {
      return [];
    }
    const df = documentFrequencies(corpus);
    const averageLength =
      corpus.reduce(
        (sum, e) => sum + e.index.lengths.reduce((a, b) => a + b, 0),
        0,
      ) / total;
    const idf = (term: string) => {
      const n = df.get(term) ?? 0;
      return Math.log(1 + (total - n + 0.5) / (n + 0.5));
    };
    const scored: ScoredPassage[] = [];
    for (const entry of corpus) {
      entry.index.termFrequencies.forEach((tf, position) => {
        const length = entry.index.lengths[position];
        let score = 0;
        for (const term of queryTerms) {
          const f = tf.get(term) ?? 0;
          if (f > 0) {
            score +=
              (idf(term) * f * (K1 + 1)) /
              (f + K1 * (1 - B + (B * length) / (averageLength || 1)));
          }
        }
        if (score > 0) {
          scored.push({entry, position, score});
        }
      });
    }
    return scored.sort(
      (a, b) =>
        b.score - a.score ||
        a.entry.docOrder - b.entry.docOrder ||
        a.position - b.position,
    );
  },
};

const MAX_INDEXED_CHARS = 4_000_000;
const indexCache = new Map<string, PassageIndex>();

const cacheKey = (ref: DocumentRef) =>
  `${documentKey(ref)}:c${CHUNKER_VERSION}`;

const buildIndex = async (
  ref: DocumentRef,
  pages: string[],
): Promise<PassageIndex> => {
  const passages = await chunkDocument(ref, pages);
  const termFrequencies = passages.map(passage => {
    const tf = new Map<string, number>();
    for (const term of terms(passage.text)) {
      tf.set(term, (tf.get(term) ?? 0) + 1);
    }
    return tf;
  });
  return {
    ref,
    passages,
    termFrequencies,
    lengths: termFrequencies.map(tf =>
      [...tf.values()].reduce((a, b) => a + b, 0),
    ),
    chars: passages.reduce((sum, p) => sum + p.text.length, 0),
  };
};

const indexFor = async (
  ref: DocumentRef,
  pages: string[],
): Promise<PassageIndex> => {
  const key = cacheKey(ref);
  const cached = indexCache.get(key);
  if (cached) {
    indexCache.delete(key);
    indexCache.set(key, cached);
    return {...cached, ref};
  }
  const index = await buildIndex(ref, pages);
  indexCache.set(key, index);
  let chars = [...indexCache.values()].reduce((sum, i) => sum + i.chars, 0);
  for (const [oldKey, old] of indexCache) {
    if (chars <= MAX_INDEXED_CHARS || oldKey === key) {
      break;
    }
    indexCache.delete(oldKey);
    chars -= old.chars;
  }
  return index;
};

export const clearDocumentIndexCache = (): void => indexCache.clear();

const PAGE_MENTION = /\b(?:pp?\.|pages?)\s*(\d+)(?:\s*[–-]\s*(\d+))?/gi;

const mentionedPages = (query: string): Set<number> => {
  const pages = new Set<number>();
  for (const match of query.matchAll(PAGE_MENTION)) {
    const from = Number(match[1]);
    const to = Math.min(Number(match[2] ?? match[1]), from + 50);
    for (let page = from; page <= to; page++) {
      pages.add(page);
    }
  }
  return pages;
};

const discriminativeHits = (query: string, corpus: CorpusEntry[]): number => {
  const total = corpus.reduce((sum, e) => sum + e.index.passages.length, 0);
  const df = documentFrequencies(corpus);
  const strong = new Set(
    terms(query).filter(term => {
      const n = df.get(term) ?? 0;
      return n > 0 && n <= total / 2;
    }),
  );
  let hits = 0;
  for (const {index} of corpus) {
    for (const tf of index.termFrequencies) {
      if ([...strong].some(term => tf.has(term))) {
        hits += 1;
      }
    }
  }
  return hits;
};

const tokensOf = (passage: Passage) => estimateDocTokens(passage.text);

export interface RetrieveInput {
  query: string;
  previousQuery?: string;
  /** Searched refs of the chat, in attach order. */
  searchedRefs: DocumentRef[];
  texts: DocumentTexts;
  excerptBudget: number;
  /** Exact size of a rendered excerpt block, when a local model can count it. */
  measure?: (excerpts: Excerpt[]) => Promise<number | undefined>;
  retriever?: Retriever;
}

export const retrieveExcerpts = async ({
  query,
  previousQuery,
  searchedRefs,
  texts,
  excerptBudget,
  measure,
  retriever = bm25Retriever,
}: RetrieveInput): Promise<ExcerptResult> => {
  const corpus: CorpusEntry[] = [];
  const seen = new Set<string>();
  for (const ref of searchedRefs) {
    const key = documentKey(ref);
    const pages = texts.get(key);
    if (seen.has(key) || !pages || pages === 'missing') {
      continue;
    }
    seen.add(key);
    corpus.push({index: await indexFor(ref, pages), docOrder: corpus.length});
  }

  const effectiveQuery =
    previousQuery && discriminativeHits(query, corpus) < EXCERPT_K
      ? `${query} ${previousQuery}`
      : query;
  const pages = mentionedPages(query);
  const byPage: ScoredPassage[] = corpus.flatMap(entry =>
    entry.index.passages.flatMap((passage, position) =>
      passage.page !== undefined && pages.has(passage.page)
        ? [{entry, position, score: Infinity}]
        : [],
    ),
  );
  byPage.sort(
    (a, b) =>
      a.entry.index.passages[a.position].page! -
        b.entry.index.passages[b.position].page! ||
      a.entry.docOrder - b.entry.docOrder ||
      a.position - b.position,
  );
  const ranked = [...byPage, ...retriever.rank(effectiveQuery, corpus)];
  if (ranked.length === 0) {
    return {kind: 'noMatch'};
  }

  const taken = new Set<string>();
  const keyOf = (entry: CorpusEntry, position: number) =>
    `${entry.docOrder}:${position}`;
  const selected: Array<{entry: CorpusEntry; positions: number[]}> = [];
  let remaining = excerptBudget - EXCERPT_LEAD_TOKENS;
  for (const {entry, position} of ranked) {
    if (selected.length >= EXCERPT_K) {
      break;
    }
    if (taken.has(keyOf(entry, position))) {
      continue;
    }
    const passages = entry.index.passages;
    const passage = passages[position];
    const free = (p: number) =>
      passages[p] &&
      passages[p].page === passage.page &&
      !taken.has(keyOf(entry, p));
    const neighbour = free(position + 1)
      ? position + 1
      : free(position - 1)
        ? position - 1
        : undefined;
    const single = excerptCost(entry.index.ref, [tokensOf(passage)]);
    const pair =
      neighbour === undefined
        ? undefined
        : excerptCost(entry.index.ref, [
            tokensOf(passage),
            tokensOf(passages[neighbour]),
          ]);
    let positions: number[] | undefined;
    if (
      EXCERPT_MAX_PASSAGES > 1 &&
      neighbour !== undefined &&
      pair !== undefined &&
      pair <= remaining
    ) {
      positions = [position, neighbour].sort((a, b) => a - b);
      remaining -= pair;
    } else if (single <= remaining) {
      positions = [position];
      remaining -= single;
    }
    if (positions) {
      positions.forEach(p => taken.add(keyOf(entry, p)));
      selected.push({entry, positions});
    }
  }

  const toExcerpts = (picks: typeof selected): Excerpt[] =>
    [...picks]
      .sort(
        (a, b) =>
          a.entry.docOrder - b.entry.docOrder ||
          a.positions[0] - b.positions[0],
      )
      .map(({entry, positions}) => ({
        ref: entry.index.ref,
        passages: positions.map(p => entry.index.passages[p]),
      }));

  if (measure) {
    while (selected.length > 1) {
      const exact = await measure(toExcerpts(selected));
      if (exact === undefined || exact <= excerptBudget) {
        break;
      }
      selected.pop();
    }
  }
  return {kind: 'excerpts', excerpts: toExcerpts(selected)};
};
