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
  });
});
