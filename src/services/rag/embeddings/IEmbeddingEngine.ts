/**
 * IEmbeddingEngine — abstraction for turning text into a fixed-dimension vector.
 *
 * This is the extension point defined by ADR-2026-005 (Fully local RAG).
 *
 * Two shipped implementations:
 *  - LexicalEmbeddingEngine: on-device TF/IDF-style lexical hashing. No model
 *    download, no network. This is the default and keeps RAG 100% local.
 *  - NoopEmbeddingEngine: returns null so VectorStore falls back to keyword
 *    matching. Useful for tests or for disabling semantic retrieval.
 *
 * A future `DenseEmbeddingEngine` (e.g. a local GGUF embedding model via
 * llama.rn) can implement the same interface and be swapped in via
 * `RAGManager.setEmbeddingEngine(...)` without touching the rest of the pipeline.
 */

export type EmbeddingKind = 'lexical' | 'dense' | 'none';

export interface IEmbeddingEngine {
  /** Engine family — used for telemetry / diagnostics. */
  readonly kind: EmbeddingKind;
  /** Output vector dimension. Query and chunk vectors share this dimension. */
  readonly dimension: number;
  /**
   * Embed a piece of text into a vector.
   * @returns A `number[]` of length `dimension`, or `null` to signal that the
   *          caller should fall back to lexical keyword search.
   */
  embed(text: string): Promise<number[] | null>;
}
