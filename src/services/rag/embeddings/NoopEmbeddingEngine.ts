/**
 * NoopEmbeddingEngine — disabled semantic embedding.
 *
 * `embed` returns `null`, which signals RAGManager / VectorStore to fall back
 * to lexical keyword matching. Used in tests and as an opt-out for semantic
 * retrieval.
 */

import type {IEmbeddingEngine} from './IEmbeddingEngine';

export class NoopEmbeddingEngine implements IEmbeddingEngine {
  readonly kind = 'none' as const;
  readonly dimension: number;

  constructor(dimension = 384) {
    this.dimension = dimension;
  }

  async embed(_text: string): Promise<null> {
    return null;
  }
}
