/**
 * Hybrid retrieval: dense vector search fused with a BM25 keyword pass
 * via reciprocal rank fusion (RRF).
 *
 * Phone corpora are small (hundreds to low thousands of chunks), so
 * brute-force scoring in JS is faster than any index structure at this
 * scale - a 5k-chunk x 384-dim corpus is ~2M multiplies per query.
 * Small embedding models blur exact tokens (IDs, error codes, file
 * names) that keyword search nails, which is why both passes run and
 * fuse: RRF rewards chunks that rank well in either list without
 * needing comparable score scales.
 */

import {dotProduct, l2Normalize} from './vectorStore';

export interface RetrievedChunk<T> {
  item: T;
  /** Fused RRF score (higher = better). */
  score: number;
  /** Cosine similarity from the vector pass (NaN if no query vector). */
  cosine: number;
}

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter(t => t.length > 1);

/** BM25 over a candidate set. k1/b are the standard sensitivity knobs. */
export const bm25Scores = (
  query: string,
  docs: string[],
  k1 = 1.5,
  b = 0.75,
): number[] => {
  const queryTerms = new Set(tokenize(query));
  if (queryTerms.size === 0 || docs.length === 0) {
    return new Array(docs.length).fill(0);
  }

  const docTerms = docs.map(d => tokenize(d));
  const avgLen =
    docTerms.reduce((s, t) => s + t.length, 0) / docTerms.length || 1;

  // Document frequency per query term.
  const df = new Map<string, number>();
  for (const term of queryTerms) {
    let count = 0;
    for (const terms of docTerms) {
      if (terms.includes(term)) {
        count++;
      }
    }
    df.set(term, count);
  }

  return docTerms.map(terms => {
    const len = terms.length || 1;
    let score = 0;
    for (const term of queryTerms) {
      const tf = terms.reduce((n, t) => (t === term ? n + 1 : n), 0);
      if (tf === 0) {
        continue;
      }
      const n = df.get(term) ?? 1;
      const idf = Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
      score += (idf * tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * len) / avgLen));
    }
    return score;
  });
};

/**
 * Reciprocal rank fusion. Each input is an array of item indices
 * ordered best-first; output maps item index to fused score.
 */
export const rrfFuse = (rankings: number[][], k = 60): Map<number, number> => {
  const fused = new Map<number, number>();
  for (const ranking of rankings) {
    ranking.forEach((item, rank) => {
      fused.set(item, (fused.get(item) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return fused;
};

export interface RetrieveOptions<T> {
  query: string;
  /** Chunk texts, parallel to `items`. */
  texts: string[];
  items: T[];
  /** Query embedding (already normalized preferred). */
  queryVector?: number[] | Float32Array | null;
  /** Chunk embeddings parallel to `items`; required for the dense pass. */
  vectors?: (number[] | Float32Array)[];
  topK?: number;
  /** Minimum cosine to keep a chunk from the dense pass. */
  minCosine?: number;
}

/** Dense + sparse retrieval fused with RRF; best-first. */
export const retrieveChunks = <T>(
  options: RetrieveOptions<T>,
): RetrievedChunk<T>[] => {
  const {query, texts, items, queryVector, vectors} = options;
  const topK = Math.max(options.topK ?? 8, 1);
  const minCosine = options.minCosine ?? 0;

  const denseRanks: number[][] = [];

  if (queryVector && vectors && vectors.length === items.length) {
    const q = l2Normalize(queryVector);
    const cosines = vectors.map(v =>
      v && v.length === q.length ? dotProduct(l2Normalize(v), q) : -1,
    );
    const eligible = cosines
      .map((c, i) => ({c, i}))
      .filter(({c}) => c >= minCosine)
      .sort((a, b) => b.c - a.c);
    denseRanks.push(eligible.map(({i}) => i));
    if (eligible.length === 0) {
      return [];
    }
  }

  const sparse = bm25Scores(query, texts);
  const sparseRanking = sparse
    .map((s, i) => ({s, i}))
    .filter(({s}) => s > 0)
    .sort((a, b) => b.s - a.s)
    .map(({i}) => i);

  const rankings = [...denseRanks, sparseRanking].filter(r => r.length > 0);
  if (rankings.length === 0) {
    return [];
  }

  const fused = rrfFuse(rankings);
  return [...fused.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([i, score]) => ({
      item: items[i],
      score,
      cosine:
        queryVector && vectors
          ? dotProduct(l2Normalize(vectors[i]), l2Normalize(queryVector))
          : NaN,
    }));
};
