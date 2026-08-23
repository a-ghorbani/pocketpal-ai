/**
 * Orchestrates the local knowledge base: persisted settings, the
 * index pipeline (read -> chunk -> embed -> persist), embedding-model
 * download, and hybrid retrieval at query time.
 *
 * Two routing modes exist for attachments:
 *  - direct injection (small files, capped by the context-aware budget)
 *  - indexing into this knowledge base (large files), with retrieval
 *    fetching only the relevant chunks per question.
 */
import {makeAutoObservable, runInAction} from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {makePersistable} from 'mobx-persist-store';
import * as RNFS from '@dr.pogodin/react-native-fs';

import {
  embeddingStore,
  modelPathFor,
  EMBEDDING_MODELS_DIR,
} from './EmbeddingStore';
import {knowledgeBaseRepository} from '../repositories/KnowledgeBaseRepository';
import {KbDocument} from '../database';

import {
  chunkText,
  deleteDocVectors,
  readDocVectors,
  retrieveChunks,
  writeDocVectors,
} from '../utils/rag';
import {
  DEFAULT_EMBEDDING_PRESET_ID,
  EmbeddingPreset,
  EMBEDDING_PRESETS,
  getPreset,
} from '../utils/rag/presets';

/** Files whose readable text exceeds this go to the knowledge base. */
export const DEFAULT_AUTO_INDEX_THRESHOLD = 20_000;

export interface KbSearchHit {
  docId: string;
  docName: string;
  position: number;
  text: string;
  score: number;
  cosine: number;
}

/** Fast non-crypto hash (FNV-1a x2 32-bit) for change detection. */
export const contentHash = (text: string): string => {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16)}${h2.toString(16)}-${text.length}`;
};

class KnowledgeBaseStore {
  // --- persisted settings ---
  enabled = false;
  embeddingPresetId: string = DEFAULT_EMBEDDING_PRESET_ID;
  autoIndexThresholdChars = DEFAULT_AUTO_INDEX_THRESHOLD;
  chunkChars = 1_400;
  topK = 8;
  minCosine = 0.25;
  includeInAllChats = false;

  // --- runtime state ---
  documents: KbDocument[] = [];
  isIndexing = false;
  indexingProgress = {name: '', done: 0, total: 0};
  isDownloadingModel = false;
  downloadProgress = 0; // 0..1
  lastError: string | null = null;

  /** In-memory vector cache: docId -> vectors (not observable). */
  vectorCache = new Map<string, Float32Array[]>();

  constructor() {
    makeAutoObservable(this, {vectorCache: false}, {autoBind: true});
    makePersistable(this, {
      name: 'KnowledgeBaseStore',
      storage: AsyncStorage,
      properties: [
        'enabled',
        'embeddingPresetId',
        'autoIndexThresholdChars',
        'chunkChars',
        'topK',
        'minCosine',
        'includeInAllChats',
      ],
    });
    void this.refreshDocuments();
  }

  // --- settings ---

  setEnabled(v: boolean) {
    this.enabled = v;
    if (!v) {
      void embeddingStore.release();
    }
  }

  setPreset(id: string) {
    if (getPreset(id)) {
      this.embeddingPresetId = id;
    }
  }

  setTopK(v: number) {
    this.topK = Math.min(Math.max(Math.round(v), 1), 20);
  }

  setMinCosine(v: number) {
    this.minCosine = Math.min(Math.max(v, 0), 1);
  }

  setAutoIndexThreshold(v: number) {
    this.autoIndexThresholdChars = Math.min(
      Math.max(Math.round(v), 2_000),
      200_000,
    );
  }

  get preset(): EmbeddingPreset {
    return getPreset(this.embeddingPresetId) ?? EMBEDDING_PRESETS[0];
  }

  async isModelDownloaded(): Promise<boolean> {
    return RNFS.exists(modelPathFor(this.embeddingPresetId));
  }

  // --- embedding model download ---

  async downloadEmbeddingModel(): Promise<void> {
    const preset = this.preset;
    const dest = modelPathFor(preset.id);
    if (this.isDownloadingModel) {
      return;
    }
    runInAction(() => {
      this.isDownloadingModel = true;
      this.downloadProgress = 0;
      this.lastError = null;
    });
    try {
      await RNFS.mkdir(EMBEDDING_MODELS_DIR).catch(() => undefined);
      const job = RNFS.downloadFile({
        fromUrl: preset.url,
        toFile: dest,
        background: false,
        progressInterval: 500,
        progress: res => {
          runInAction(() => {
            this.downloadProgress =
              res.contentLength > 0 ? res.bytesWritten / res.contentLength : 0;
          });
        },
      });
      await job.promise;
      runInAction(() => {
        this.isDownloadingModel = false;
        this.downloadProgress = 1;
      });
    } catch (err) {
      runInAction(() => {
        this.isDownloadingModel = false;
        this.lastError = err instanceof Error ? err.message : 'Download failed';
      });
      await RNFS.unlink(dest).catch(() => undefined);
      throw err;
    }
  }

  async deleteEmbeddingModel(): Promise<void> {
    await embeddingStore.release();
    this.vectorCache.clear();
    await RNFS.unlink(modelPathFor(this.embeddingPresetId)).catch(
      () => undefined,
    );
  }

  // --- indexing ---

  async refreshDocuments(): Promise<void> {
    try {
      const docs = await knowledgeBaseRepository.getDocuments();
      runInAction(() => {
        this.documents = docs;
      });
    } catch (err) {
      console.warn('[KB] refreshDocuments failed', err);
    }
  }

  async findByContent(text: string): Promise<KbDocument | null> {
    const matches = await knowledgeBaseRepository.findByHash(contentHash(text));
    return matches.find(d => d.status === 'ready') ?? null;
  }

  /**
   * Index a document: chunk, embed every chunk, persist vectors +
   * chunk rows. Returns the document id. Re-indexing the same content
   * is a no-op (content-hash dedupe).
   */
  async indexDocument(input: {
    name: string;
    mime?: string;
    size: number;
    text: string;
    source: 'attach' | 'manual';
  }): Promise<KbDocument> {
    const text = input.text;
    if (!text.trim()) {
      throw new Error('Nothing text-readable to index');
    }

    const existing = await this.findByContent(text);
    if (existing) {
      return existing;
    }

    if (!(await this.isModelDownloaded())) {
      throw new Error(
        `Embedding model (${this.preset.label}) not downloaded yet`,
      );
    }

    const chunks = chunkText(text, {
      targetChars: this.chunkChars,
    });

    let doc = await knowledgeBaseRepository.createDocument({
      name: input.name,
      mime: input.mime,
      size: input.size,
      contentHash: contentHash(text),
      presetId: this.embeddingPresetId,
      dims: this.preset.dims,
      source: input.source,
    });

    runInAction(() => {
      this.isIndexing = true;
      this.indexingProgress = {name: input.name, done: 0, total: chunks.length};
    });

    try {
      const vectors: Float32Array[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const v = await embeddingStore.embed(
          chunks[i].text,
          this.embeddingPresetId,
        );
        vectors.push(v);
        runInAction(() => {
          this.indexingProgress = {
            name: input.name,
            done: i + 1,
            total: chunks.length,
          };
        });
      }

      await writeDocVectors(doc.id, vectors);
      await knowledgeBaseRepository.replaceChunks(
        doc,
        chunks.map(c => ({position: c.index, text: c.text})),
      );
      doc = await knowledgeBaseRepository.finalizeDocument(doc, {
        chunkCount: chunks.length,
        charCount: text.length,
        dims: vectors[0]?.length ?? this.preset.dims,
      });
      this.vectorCache.delete(doc.id);
      runInAction(() => {
        this.isIndexing = false;
        this.indexingProgress = {name: '', done: 0, total: 0};
      });
      await this.refreshDocuments();
      return doc;
    } catch (err) {
      runInAction(() => {
        this.isIndexing = false;
      });
      await knowledgeBaseRepository.failDocument(
        doc,
        err instanceof Error ? err.message : String(err),
      );
      await this.refreshDocuments();
      throw err;
    }
  }

  // --- retrieval ---

  private async vectorsFor(doc: KbDocument): Promise<Float32Array[]> {
    const cached = this.vectorCache.get(doc.id);
    if (cached) {
      return cached;
    }
    const vectors = await readDocVectors(doc.id, doc.dims);
    if (vectors.length > 0) {
      this.vectorCache.set(doc.id, vectors);
    }
    return vectors;
  }

  /**
   * Hybrid retrieval over the given documents (or the whole corpus).
   * Returns best-first hits suitable for prompt injection.
   */
  async query(
    queryText: string,
    docIds?: string[],
    topK?: number,
  ): Promise<KbSearchHit[]> {
    if (!this.enabled) {
      return [];
    }
    const docs = (await knowledgeBaseRepository.getReadyDocuments()).filter(
      d => !docIds || docIds.includes(d.id),
    );
    if (docs.length === 0) {
      return [];
    }

    const texts: string[] = [];
    const items: {doc: KbDocument; position: number}[] = [];
    const vectors: (Float32Array | null)[] = [];

    for (const doc of docs) {
      const chunks = await knowledgeBaseRepository.getChunks(doc.id);
      const docVectors = await this.vectorsFor(doc);
      chunks.forEach((chunk, i) => {
        texts.push(chunk.text);
        items.push({doc, position: chunk.position});
        vectors.push(docVectors[i] ?? null);
      });
    }
    if (texts.length === 0) {
      return [];
    }

    // Dense pass needs the query embedding; if the model is missing we
    // degrade to keyword-only retrieval instead of failing the chat.
    let queryVector: Float32Array | null = null;
    try {
      queryVector = await embeddingStore.embed(
        queryText,
        this.embeddingPresetId,
      );
    } catch (err) {
      console.warn('[KB] query embedding unavailable, keyword-only:', err);
    }

    // retrieveChunks expects vectors parallel to items; null entries
    // drop out of the dense pass but stay eligible for keyword hits.
    const hits = retrieveChunks<{
      doc: KbDocument;
      position: number;
      text: string;
    }>({
      query: queryText,
      texts,
      items: items.map((it, i) => ({...it, text: texts[i]})),
      queryVector,
      vectors: vectors as unknown as (number[] | Float32Array)[],
      topK: topK ?? this.topK,
      minCosine: this.minCosine,
    });

    return hits.map(h => ({
      docId: h.item.doc.id,
      docName: h.item.doc.name,
      position: h.item.position,
      text: h.item.text,
      score: h.score,
      cosine: h.cosine,
    }));
  }

  // --- maintenance ---

  async deleteDocument(doc: KbDocument): Promise<void> {
    await knowledgeBaseRepository.deleteDocument(doc);
    this.vectorCache.delete(doc.id);
    await deleteDocVectors(doc.id);
    await this.refreshDocuments();
  }

  async reindexDocument(doc: KbDocument, text: string): Promise<KbDocument> {
    await this.deleteDocument(doc);
    return this.indexDocument({
      name: doc.name,
      mime: doc.mime ?? undefined,
      size: doc.size,
      text,
      source: 'manual',
    });
  }

  async previewChunks(doc: KbDocument): Promise<string[]> {
    const chunks = await knowledgeBaseRepository.getChunks(doc.id);
    return chunks.map(c => c.text);
  }
}

export const knowledgeBaseStore = new KnowledgeBaseStore();
