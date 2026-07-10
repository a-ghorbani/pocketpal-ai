/**
 * LexicalEmbeddingEngine — fully on-device lexical embedding.
 *
 * Turns text into a fixed-dimension real-valued vector using:
 *  - Tokenization: Latin/alphanumeric words + CJK bigrams (so Chinese/Japanese/
 *    Korean knowledge bases are retrievable, unlike the old `[a-z0-9]+`-only
 *    tokenizer which dropped all CJK text).
 *  - Stopword removal (English + CJK function words).
 *  - Sublinear term frequency weighting: 1 + log10(tf).
 *  - Hashing trick: each term is mapped to a stable dimension via FNV-1a, so
 *    query and chunk vectors always share the same coordinate space and can be
 *    compared with cosine similarity.
 *  - L2 normalization.
 *
 * No model download, no network, no native module. This is what makes the
 * fork's RAG genuinely "本地优先" out of the box, and it upgrades retrieval
 * from the old binary keyword match to graded cosine similarity.
 *
 * Trade-off: hashed lexical vectors are not semantically dense (synonyms do
 * not collide), but they are robust, instant, and zero-cost. A future
 * `DenseEmbeddingEngine` implementing `IEmbeddingEngine` can replace this
 * without any change to RAGManager or VectorStore.
 */

import {ALL_STOPWORDS} from './stopwords';
import type {IEmbeddingEngine} from './IEmbeddingEngine';

const CJK_RUN = /[一-鿿㐀-䶿]/g;

function hashTerm(term: string, dimension: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < term.length; i++) {
    h ^= term.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % dimension;
}

export class LexicalEmbeddingEngine implements IEmbeddingEngine {
  readonly kind = 'lexical' as const;
  readonly dimension: number;
  private readonly stopwords: ReadonlySet<string>;

  constructor(dimension = 384, stopwords: ReadonlySet<string> = ALL_STOPWORDS) {
    this.dimension = dimension;
    this.stopwords = stopwords;
  }

  /**
   * Tokenize text into indexable terms.
   * Latin/alphanumeric words (length >= 2) plus CJK bigrams.
   */
  tokenize(text: string): string[] {
    if (!text) return [];
    const lower = text.toLowerCase();
    const tokens: string[] = [];

    // Latin / alphanumeric words
    const latinMatches = lower.match(/[a-z0-9]{2,}/g);
    if (latinMatches) {
      for (const w of latinMatches) {
        if (!this.stopwords.has(w)) tokens.push(w);
      }
    }

    // CJK runs -> bigrams (single char kept only when isolated)
    let m: RegExpExecArray | null;
    CJK_RUN.lastIndex = 0;
    while ((m = CJK_RUN.exec(lower)) !== null) {
      const run = m[0];
      if (run.length === 1) {
        if (!this.stopwords.has(run)) tokens.push(run);
        continue;
      }
      for (let i = 0; i < run.length - 1; i++) {
        const bigram = run.slice(i, i + 2);
        if (!this.stopwords.has(bigram)) tokens.push(bigram);
      }
    }

    return tokens;
  }

  async embed(text: string): Promise<number[]> {
    const tokens = this.tokenize(text);
    const vec = new Array<number>(this.dimension).fill(0);
    if (tokens.length === 0) return vec;

    // Term frequency
    const tf = new Map<string, number>();
    for (const t of tokens) {
      tf.set(t, (tf.get(t) ?? 0) + 1);
    }

    // Accumulate weighted, hashed terms
    for (const [term, count] of tf) {
      const weight = 1 + Math.log10(count);
      vec[hashTerm(term, this.dimension)] += weight;
    }

    // L2 normalization
    let norm = 0;
    for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm === 0) return vec;
    for (let i = 0; i < vec.length; i++) vec[i] /= norm;

    return vec;
  }
}
