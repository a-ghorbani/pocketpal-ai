import {getModelMemoryRequirement} from '../memoryEstimator';
import {Model} from '../types';
import {createDefaultContextInitParams} from '../contextInitParamsVersions';

describe('memoryEstimator', () => {
  const contextSettings = createDefaultContextInitParams();

  const baseModel: Partial<Model> = {
    id: 'test-model',
    name: 'Test Model',
    size: 2 * 1e9, // 2GB
    isDownloaded: true,
  };

  describe('getModelMemoryRequirement', () => {
    it('uses fallback estimation when no metadata', () => {
      const model = {...baseModel} as Model;
      const result = getModelMemoryRequirement(
        model,
        undefined,
        contextSettings,
      );

      // Fallback: size × 1.2
      expect(result).toBe(2 * 1e9 * 1.2);
    });

    it('uses fallback estimation when metadata has NaN values (upgrade safety)', () => {
      const model = {
        ...baseModel,
        ggufMetadata: {
          architecture: 'qwen2',
          n_layers: NaN, // Corrupted from old parsing bug
          n_embd: NaN,
          n_head: NaN,
          n_head_kv: NaN,
          n_vocab: NaN,
          n_embd_head_k: NaN,
          n_embd_head_v: NaN,
        },
      } as Model;

      const result = getModelMemoryRequirement(
        model,
        undefined,
        contextSettings,
      );

      // Should fall back to size × 1.2, NOT produce NaN
      expect(result).toBe(2 * 1e9 * 1.2);
      expect(Number.isNaN(result)).toBe(false);
    });

    it('uses fallback estimation when metadata has zero values', () => {
      const model = {
        ...baseModel,
        ggufMetadata: {
          architecture: 'llama',
          n_layers: 0, // Invalid
          n_embd: 4096,
          n_head: 32,
          n_head_kv: 8,
          n_vocab: 32000,
          n_embd_head_k: 128,
          n_embd_head_v: 128,
        },
      } as Model;

      const result = getModelMemoryRequirement(
        model,
        undefined,
        contextSettings,
      );

      // Should fall back because n_layers is 0
      expect(result).toBe(2 * 1e9 * 1.2);
    });

    it('uses fallback estimation when metadata has undefined values', () => {
      const model = {
        ...baseModel,
        ggufMetadata: {
          architecture: 'llama',
          n_layers: undefined as unknown as number,
          n_embd: 4096,
          n_head: 32,
          n_head_kv: 8,
          n_vocab: 32000,
          n_embd_head_k: 128,
          n_embd_head_v: 128,
        },
      } as Model;

      const result = getModelMemoryRequirement(
        model,
        undefined,
        contextSettings,
      );

      // Should fall back because n_layers is undefined
      expect(result).toBe(2 * 1e9 * 1.2);
    });

    it('uses GGUF-based estimation when metadata is valid', () => {
      const model = {
        ...baseModel,
        ggufMetadata: {
          architecture: 'llama',
          n_layers: 32,
          n_embd: 4096,
          n_head: 32,
          n_head_kv: 8,
          n_vocab: 32000,
          n_embd_head_k: 128,
          n_embd_head_v: 128,
        },
      } as Model;

      const result = getModelMemoryRequirement(
        model,
        undefined,
        contextSettings,
      );

      // Should use GGUF formula, result should be different from fallback
      expect(result).not.toBe(2 * 1e9 * 1.2);
      expect(Number.isNaN(result)).toBe(false);
      expect(result).toBeGreaterThan(0);
    });

    it('includes projection model size in estimation', () => {
      const model = {...baseModel} as Model;
      const projectionModel = {size: 500 * 1e6} as Model; // 500MB

      const withoutProj = getModelMemoryRequirement(
        model,
        undefined,
        contextSettings,
      );
      const withProj = getModelMemoryRequirement(
        model,
        projectionModel,
        contextSettings,
      );

      expect(withProj).toBeGreaterThan(withoutProj);
    });

    it('adds draft model size in the fallback branch', () => {
      const model = {...baseModel} as Model;
      const draftModel = {size: 500 * 1e6} as Model; // 500MB

      const withoutDraft = getModelMemoryRequirement(
        model,
        undefined,
        contextSettings,
      );
      const withDraft = getModelMemoryRequirement(
        model,
        undefined,
        contextSettings,
        draftModel,
      );

      // Fallback: (target + draft) × 1.2
      expect(withDraft).toBe((2 * 1e9 + 500 * 1e6) * 1.2);
      expect(withDraft).toBeGreaterThan(withoutDraft);
    });

    it('sums projection and draft sizes (additive, not max)', () => {
      const model = {...baseModel} as Model;
      const projectionModel = {size: 500 * 1e6} as Model; // 500MB
      const draftModel = {size: 300 * 1e6} as Model; // 300MB

      const projOnly = getModelMemoryRequirement(
        model,
        projectionModel,
        contextSettings,
      );
      const both = getModelMemoryRequirement(
        model,
        projectionModel,
        contextSettings,
        draftModel,
      );

      // Both resident at load → sizes summed, so adding a draft strictly grows
      // the estimate beyond projection-only (not max).
      expect(both).toBeGreaterThan(projOnly);
      expect(both).toBe((2 * 1e9 + 500 * 1e6 + 300 * 1e6) * 1.2);
    });

    it('sums the draft weights AND the draft KV cache in the GGUF metadata branch', () => {
      const model = {
        ...baseModel,
        ggufMetadata: {
          architecture: 'llama',
          n_layers: 32,
          n_embd: 4096,
          n_head: 32,
          n_head_kv: 8,
          n_vocab: 32000,
          n_embd_head_k: 128,
          n_embd_head_v: 128,
        },
      } as Model;
      // A draft WITH its own metadata runs its own KV cache, sized by the
      // target n_ctx and the draft cache type (default f16).
      const draftMetadata = {
        architecture: 'llama',
        n_layers: 16,
        n_embd: 1024,
        n_head: 16,
        n_head_kv: 4,
        n_vocab: 32000,
        n_embd_head_k: 64,
        n_embd_head_v: 64,
      };
      const draftModel = {
        size: 400 * 1e6, // 400MB
        ggufMetadata: draftMetadata,
      } as Model;

      const withoutDraft = getModelMemoryRequirement(
        model,
        undefined,
        contextSettings,
      );
      const withDraft = getModelMemoryRequirement(
        model,
        undefined,
        contextSettings,
        draftModel,
      );

      // Draft KV: target n_ctx × draft cache (f16, 2 bytes), key + value.
      const {n_ctx} = contextSettings;
      const draftKv =
        draftMetadata.n_layers *
          n_ctx *
          draftMetadata.n_embd_head_k *
          draftMetadata.n_head_kv *
          2.0 +
        draftMetadata.n_layers *
          n_ctx *
          draftMetadata.n_embd_head_v *
          draftMetadata.n_head_kv *
          2.0;

      // Estimate includes the draft weights AND the draft KV footprint, not
      // weights-only.
      expect(withDraft).toBeCloseTo(
        withoutDraft + (400 * 1e6 + draftKv) * 1.1,
        0,
      );
      expect(withDraft).toBeGreaterThan(withoutDraft + 400 * 1e6 * 1.1);
    });

    it('falls back to draft weights-only when the draft has no metadata', () => {
      const model = {
        ...baseModel,
        ggufMetadata: {
          architecture: 'llama',
          n_layers: 32,
          n_embd: 4096,
          n_head: 32,
          n_head_kv: 8,
          n_vocab: 32000,
          n_embd_head_k: 128,
          n_embd_head_v: 128,
        },
      } as Model;
      const draftModel = {size: 400 * 1e6} as Model; // no metadata

      const withoutDraft = getModelMemoryRequirement(
        model,
        undefined,
        contextSettings,
      );
      const withDraft = getModelMemoryRequirement(
        model,
        undefined,
        contextSettings,
        draftModel,
      );

      expect(withDraft).toBeCloseTo(withoutDraft + 400 * 1e6 * 1.1, 0);
    });

    it('is unchanged when no draft is passed', () => {
      const model = {...baseModel} as Model;
      const a = getModelMemoryRequirement(model, undefined, contextSettings);
      const b = getModelMemoryRequirement(
        model,
        undefined,
        contextSettings,
        undefined,
      );
      expect(a).toBe(b);
    });
  });
});
