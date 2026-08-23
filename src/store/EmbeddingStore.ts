/**
 * Lifecycle for the knowledge base's embedding model: a second, small
 * llama.rn context (mean pooling) that coexists with the chat model.
 * Loading is lazy - the context is only created when a document is
 * actually indexed or a query is embedded, and released after idle so
 * a 33-600MB embedding model never sits in RAM unused.
 */
import {AppState} from 'react-native';

import {LlamaContext, initLlama} from 'llama.rn';
import {makeAutoObservable, runInAction} from 'mobx';

import * as RNFS from '@dr.pogodin/react-native-fs';

import {getPreset} from '../utils/rag/presets';
import {l2Normalize} from '../utils/rag/vectorStore';

export const EMBEDDING_MODELS_DIR = `${RNFS.DocumentDirectoryPath}/kb-models`;

export const modelPathFor = (presetId: string): string =>
  `${EMBEDDING_MODELS_DIR}/${presetId}.gguf`;

export const isEmbeddingModelDownloaded = async (
  presetId: string,
): Promise<boolean> => {
  try {
    return await RNFS.exists(modelPathFor(presetId));
  } catch {
    return false;
  }
};

/** Release an idle embedding context after this many ms. Long enough
 * that a back-and-forth chat keeps the model warm; a backgrounded app
 * releases immediately via the AppState listener. */
const IDLE_RELEASE_MS = 10 * 60_000;

class EmbeddingStore {
  context: LlamaContext | null = null;
  contextPresetId: string | null = null;
  isLoading = false;
  loadError: string | null = null;

  private releaseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    makeAutoObservable(this, {}, {autoBind: true});

    // Free the embedding model's RAM as soon as the app leaves the
    // foreground; the next embed() lazily reloads it (mmap, so cheap).
    const appStateChange = (state: string) => {
      if (state !== 'active') {
        void this.release();
      }
    };
    AppState.addEventListener('change', appStateChange);
  }

  private async create(presetId: string): Promise<LlamaContext> {
    const preset = getPreset(presetId);
    if (!preset) {
      throw new Error(`Unknown embedding preset: ${presetId}`);
    }
    const path = modelPathFor(presetId);
    if (!(await RNFS.exists(path))) {
      throw new Error(
        `Embedding model ${preset.label} is not downloaded (${path})`,
      );
    }

    runInAction(() => {
      this.isLoading = true;
      this.loadError = null;
    });

    try {
      const context = await initLlama({
        model: path,
        n_ctx: 2048,
        n_batch: 512,
        // Required or the native layer rejects every embedding() call
        // with "Embedding is not enabled".
        embedding: true,
        // llama.rn maps the string to the native enum (mean = MEAN pooling).
        pooling_type: 'mean',
        use_mmap: true,
        // Embedding passes are single-shot and tiny; the chat model's
        // threadpool settings are intentionally not shared here.
        n_threads: 4,
      });
      runInAction(() => {
        this.context = context;
        this.contextPresetId = presetId;
        this.isLoading = false;
      });
      return context;
    } catch (err) {
      runInAction(() => {
        this.isLoading = false;
        this.loadError =
          err instanceof Error ? err.message : 'Failed to load embedding model';
      });
      throw err;
    }
  }

  /**
   * Get (or lazily create) the embedding context for a preset. Swaps
   * contexts if the requested preset differs from the loaded one.
   */
  async ensureContext(presetId: string): Promise<LlamaContext> {
    this.scheduleIdleRelease();
    if (this.context && this.contextPresetId === presetId) {
      return this.context;
    }
    if (this.context) {
      await this.release();
    }
    return this.create(presetId);
  }

  /** Embed one text, L2-normalized. Truncation happens natively at n_ctx. */
  async embed(text: string, presetId: string): Promise<Float32Array> {
    const context = await this.ensureContext(presetId);
    this.scheduleIdleRelease();
    const result = await context.embedding(text, {
      // 2 = L2 normalization in llama.cpp's embd_normalize.
      embd_normalize: 2,
    });
    return l2Normalize(result.embedding);
  }

  private scheduleIdleRelease(): void {
    if (this.releaseTimer) {
      clearTimeout(this.releaseTimer);
    }
    this.releaseTimer = setTimeout(() => {
      this.releaseTimer = null;
      void this.release();
    }, IDLE_RELEASE_MS);
  }

  async release(): Promise<void> {
    const ctx = this.context;
    if (!ctx) {
      return;
    }
    runInAction(() => {
      this.context = null;
      this.contextPresetId = null;
    });
    try {
      await ctx.release();
    } catch (err) {
      console.warn('[EmbeddingStore] release failed:', err);
    }
  }
}

export const embeddingStore = new EmbeddingStore();
