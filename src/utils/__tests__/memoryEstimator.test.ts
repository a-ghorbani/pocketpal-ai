import {
  getModelMemoryRequirement,
  parseGGUFMetadata,
  stateCacheBudgetMb,
} from '../memoryEstimator';
import * as ReactNative from 'react-native';
import {CacheType, GGUFMetadata, Model} from '../types';
import {ggufFileSize, ggufMetadata} from '../../../jest/fixtures/ggufMemory';
import {modelStore} from '../../store';
import {createDefaultContextInitParams} from '../contextInitParamsVersions';

describe('memoryEstimator', () => {
  const contextSettings = {
    ...createDefaultContextInitParams(),
    state_cache_budget_mb: 0,
  };

  describe('stateCacheBudgetMb', () => {
    it.each([
      ['low', 64],
      [null, 64],
      ['mid', 160],
      ['high', 160],
      ['flagship', 160],
    ] as const)('maps tier %s to %i MiB', (tier, budget) => {
      expect(stateCacheBudgetMb(tier)).toBe(budget);
    });
  });

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

  describe('state checkpoint budget', () => {
    const MiB = 1024 * 1024;
    const swaModel = (sliding_window?: number) =>
      ({
        ...baseModel,
        ggufMetadata: {
          architecture: 'gemma3',
          n_layers: 26,
          n_embd: 1152,
          n_head: 4,
          n_head_kv: 1,
          n_vocab: 262144,
          n_embd_head_k: 256,
          n_embd_head_v: 256,
          sliding_window,
        },
      }) as Model;
    const withBudget = (state_cache_budget_mb: number) => ({
      ...contextSettings,
      state_cache_budget_mb,
    });

    it('adds the full budget, outside the runtime overhead, for an SWA model', () => {
      const model = swaModel(512);
      const base = getModelMemoryRequirement(model, undefined, withBudget(0));

      expect(getModelMemoryRequirement(model, undefined, withBudget(64))).toBe(
        base + 64 * MiB,
      );
    });

    it('adds the full budget for a model that will self-disable natively', () => {
      const model = swaModel(4096);
      const base = getModelMemoryRequirement(model, undefined, withBudget(0));

      expect(getModelMemoryRequirement(model, undefined, withBudget(160))).toBe(
        base + 160 * MiB,
      );
    });

    it.each([undefined, 0])(
      'adds nothing when sliding_window is %s',
      sliding_window => {
        const model = swaModel(sliding_window);

        expect(
          getModelMemoryRequirement(model, undefined, withBudget(64)),
        ).toBe(getModelMemoryRequirement(model, undefined, withBudget(0)));
      },
    );

    it('adds nothing without metadata', () => {
      const model = {...baseModel} as Model;

      expect(getModelMemoryRequirement(model, undefined, withBudget(64))).toBe(
        2 * 1e9 * 1.2,
      );
    });

    it('counts only the target, not the draft or projector', () => {
      const model = swaModel(512);
      const projectionModel = {size: 300 * 1e6} as Model;
      const draftModel = {
        size: 400 * 1e6,
        ggufMetadata: swaModel(512).ggufMetadata,
      } as Model;
      const base = getModelMemoryRequirement(
        model,
        projectionModel,
        withBudget(0),
        draftModel,
      );

      expect(
        getModelMemoryRequirement(
          model,
          projectionModel,
          withBudget(64),
          draftModel,
        ),
      ).toBe(base + 64 * MiB);
    });
  });

  describe('hostile metadata', () => {
    const size = 2 * 1e9;
    const sizePath = size * 1.2;
    const llamaInfo = (overrides: Record<string, unknown> = {}) => ({
      'general.architecture': 'llama',
      'llama.block_count': '2',
      'llama.embedding_length': '1024',
      'llama.attention.head_count': '8',
      'llama.attention.head_count_kv': '4',
      'llama.vocab_size': '32000',
      'llama.context_length': '4096',
      ...overrides,
    });
    const estimate = (
      metadata: GGUFMetadata | undefined,
      settings = contextSettings,
    ) =>
      getModelMemoryRequirement(
        {...baseModel, size, ggufMetadata: metadata} as Model,
        undefined,
        settings,
      );
    const storedMetadata = (overrides: Partial<GGUFMetadata>) =>
      ({...parseGGUFMetadata(llamaInfo())!, ...overrides}) as GGUFMetadata;

    it.each(['2147483648', '513', '0', '-4', '1e309', '12.5', 'x'])(
      'returns no metadata for block_count %s',
      blockCount => {
        expect(
          parseGGUFMetadata(llamaInfo({'llama.block_count': blockCount})),
        ).toBeUndefined();
      },
    );

    it.each([
      ['non-numeric', '[4, x]'],
      ['wrong length', '[4, 4, 4]'],
      ['out of range', '[4, 2097152]'],
      ['unterminated', '[4, 4'],
      ['non-numeric scalar', 'four'],
    ])('takes the size path for a %s head_count_kv', (_case, value) => {
      const metadata = parseGGUFMetadata(
        llamaInfo({'llama.attention.head_count_kv': value}),
      );

      expect(metadata?.n_head_kv).toBe(0);
      expect(estimate(metadata)).toBe(sizePath);
    });

    it('keeps the other fields but takes the size path without a vocabulary size', () => {
      const metadata = parseGGUFMetadata(
        llamaInfo({'llama.vocab_size': undefined}),
      );

      expect(metadata).toMatchObject({n_vocab: 0, context_length: 4096});
      expect(estimate(metadata)).toBe(sizePath);
    });

    it('reads the vocabulary from the tokenizer length when vocab_size is absent', () => {
      const metadata = parseGGUFMetadata(
        llamaInfo({
          'llama.vocab_size': undefined,
          'tokenizer.ggml.tokens.length': 151936,
        }),
      );

      expect(metadata?.n_vocab).toBe(151936);
    });

    it.each([
      ['llama.attention.sliding_window', '-4', 'sliding_window'],
      ['llama.context_length', '1e309', 'context_length'],
      ['llama.shortconv.l_cache', '0.5', 'shortconv_l_cache'],
      ['llama.shortconv.l_cache', '0', 'shortconv_l_cache'],
    ] as const)('drops %s %s', (key, value, field) => {
      expect(parseGGUFMetadata(llamaInfo({[key]: value}))?.[field]).toBe(
        undefined,
      );
    });

    it('derives the head dimension from the first layer, as llama.cpp does', () => {
      const metadata = parseGGUFMetadata(
        llamaInfo({'llama.attention.head_count': '[4, 8]'}),
      );

      expect(metadata).toMatchObject({
        n_head: 8,
        n_embd_head_k: 256,
        n_embd_head_v: 256,
      });
    });

    it('never goes below the file size for a crafted hybrid with a fractional conv cache', () => {
      const info = {
        'general.architecture': 'lfm2',
        'lfm2.block_count': '512',
        'lfm2.embedding_length': '1000000000',
        'lfm2.attention.head_count': '1',
        'lfm2.attention.head_count_kv': `[8${', 0'.repeat(511)}]`,
        'lfm2.attention.key_length': '1',
        'lfm2.attention.value_length': '1',
        'lfm2.feed_forward_length': '1',
        'lfm2.shortconv.l_cache': '0.5',
        'lfm2.vocab_size': '1',
      };
      const settings = {...contextSettings, n_batch: 1, n_ubatch: 1};
      const metadata = parseGGUFMetadata(info);

      expect(metadata).toMatchObject({n_embd: 1e9, n_head_kv: 8});
      expect(metadata?.shortconv_l_cache).toBeUndefined();
      expect(estimate(metadata, settings)).toBe(sizePath);
      expect(
        estimate(
          {...metadata!, n_embd: 2 ** 20, shortconv_l_cache: 0.5},
          settings,
        ),
      ).toBeGreaterThanOrEqual(size);
    });

    it.each<[string, Partial<GGUFMetadata>]>([
      ['n_layers 2^31', {n_layers: 2 ** 31}],
      ['n_head_kv above 2^20', {n_head_kv: 2 ** 21}],
      ['n_embd 1e9', {n_embd: 1e9}],
      ['n_vocab 1e9', {n_vocab: 1e9}],
      ['a head dimension above 2^20', {n_embd_head_k: 2 ** 21}],
      ['a per-layer KV array of the wrong length', {n_head_kv_layers: [4]}],
      ['a negative per-layer KV entry', {n_head_kv_layers: [4, -4]}],
    ])('takes the size path for a stored record with %s', (_case, fields) => {
      expect(estimate(storedMetadata(fields))).toBe(sizePath);
    });
  });

  describe('layer layout', () => {
    const size = 1e9;
    const at16k = {
      ...contextSettings,
      n_ctx: 16384,
      flash_attn_type: 'on',
    } as const;
    const need = (info: Record<string, unknown>) =>
      getModelMemoryRequirement(
        {...baseModel, size, ggufMetadata: parseGGUFMetadata(info)} as Model,
        undefined,
        at16k,
      );
    const qwen35 = (overrides: Record<string, unknown> = {}) => ({
      'general.architecture': 'qwen35',
      'qwen35.block_count': '8',
      'qwen35.embedding_length': '1024',
      'qwen35.attention.head_count': '8',
      'qwen35.attention.head_count_kv': '2',
      'qwen35.attention.key_length': '256',
      'qwen35.attention.value_length': '256',
      'tokenizer.ggml.tokens.length': 248320,
      ...overrides,
    });
    const swaModel = (architecture: string, overrides = {}) => ({
      'general.architecture': architecture,
      [`${architecture}.block_count`]: '12',
      [`${architecture}.embedding_length`]: '1024',
      [`${architecture}.attention.head_count`]: '8',
      [`${architecture}.attention.head_count_kv`]: '4',
      [`${architecture}.attention.key_length`]: '256',
      [`${architecture}.attention.value_length`]: '256',
      'tokenizer.ggml.tokens.length': 262144,
      ...overrides,
    });

    it('defaults Qwen3.5 to one full-attention layer in four', () => {
      expect(need(qwen35())).toBe(
        need(qwen35({'qwen35.full_attention_interval': '4'})),
      );
      expect(need(qwen35())).toBeLessThan(
        need(qwen35({'qwen35.full_attention_interval': '2'})),
      );
    });

    it('lets attention.recurrent_layers win over the interval', () => {
      const interval = {'qwen35.full_attention_interval': '4'};

      expect(
        need(
          qwen35({
            ...interval,
            'qwen35.attention.recurrent_layers': '[1, 1, 1, 1, 1, 1, 1, 0]',
          }),
        ),
      ).toBeLessThan(need(qwen35(interval)));
    });

    it('falls back to the interval when attention.recurrent_layers is malformed', () => {
      const interval = {'qwen35.full_attention_interval': '4'};

      expect(
        need(
          qwen35({...interval, 'qwen35.attention.recurrent_layers': '[1, 0]'}),
        ),
      ).toBe(need(qwen35(interval)));
    });

    it('expands a scalar attention.recurrent_layers to every layer', () => {
      expect(
        parseGGUFMetadata(qwen35({'qwen35.attention.recurrent_layers': '1'}))
          ?.recurrent_layers,
      ).toEqual(new Array(8).fill(1));
    });

    it('takes the default sliding-window period of a known architecture', () => {
      const window = {'gemma3.attention.sliding_window': '1024'};

      expect(need(swaModel('gemma3', window))).toBe(
        need(
          swaModel('gemma3', {
            ...window,
            'gemma3.attention.sliding_window_pattern': '6',
          }),
        ),
      );
      expect(need(swaModel('gemma3', window))).toBeLessThan(
        need(swaModel('gemma3')),
      );
    });

    it('falls back to the default period when the pattern array is malformed', () => {
      const window = {'gemma3.attention.sliding_window': '1024'};

      expect(
        need(
          swaModel('gemma3', {
            ...window,
            'gemma3.attention.sliding_window_pattern': '[true, false]',
          }),
        ),
      ).toBe(need(swaModel('gemma3', window)));
    });

    it('counts every layer as global for an architecture with a window but no pattern', () => {
      expect(
        need(swaModel('phi3', {'phi3.attention.sliding_window': '1024'})),
      ).toBe(need(swaModel('phi3')));
    });

    it('gives shared-KV layers no cache of their own', () => {
      expect(
        need(swaModel('llama', {'llama.attention.shared_kv_layers': '4'})),
      ).toBeLessThan(need(swaModel('llama')));
    });
  });

  describe('formula terms', () => {
    const size = 1e9;
    const UB = 512;
    const settings = (
      n_ctx: number,
      flash_attn_type: 'on' | 'off',
      overrides = {},
    ) => ({
      ...contextSettings,
      n_ctx,
      n_batch: UB,
      n_ubatch: UB,
      cache_type_k: CacheType.F16,
      cache_type_v: CacheType.F16,
      flash_attn_type,
      ...overrides,
    });
    const need = (
      info: Record<string, unknown>,
      s: ReturnType<typeof settings>,
      modelSize = size,
    ) =>
      getModelMemoryRequirement(
        {
          ...baseModel,
          size: modelSize,
          ggufMetadata: parseGGUFMetadata(info),
        } as Model,
        undefined,
        s,
      );
    const dense = (overrides: Record<string, unknown> = {}) => ({
      'general.architecture': 'llama',
      'llama.block_count': '4',
      'llama.embedding_length': '1024',
      'llama.attention.head_count': '8',
      'llama.attention.head_count_kv': '2',
      'llama.attention.key_length': '128',
      'llama.attention.value_length': '128',
      'llama.feed_forward_length': '4096',
      'tokenizer.ggml.tokens.length': 151936,
      ...overrides,
    });

    it('counts n_embd x (l_cache - 1) f32 of short-convolution state per recurrent layer', () => {
      const lfm2 = (overrides: Record<string, unknown> = {}) => ({
        'general.architecture': 'lfm2',
        'lfm2.block_count': '4',
        'lfm2.embedding_length': '1024',
        'lfm2.attention.head_count': '8',
        'lfm2.attention.head_count_kv': '[0, 0, 0, 2]',
        'lfm2.feed_forward_length': '4096',
        'tokenizer.ggml.tokens.length': 65536,
        ...overrides,
      });
      const at2k = settings(2048, 'on');

      expect(need(lfm2({'lfm2.shortconv.l_cache': '3'}), at2k)).toBe(
        need(lfm2(), at2k) + 3 * 1024 * (3 - 1) * 4,
      );
    });

    it('counts the gated-delta state, d_state x d_inner included, per recurrent layer', () => {
      const qwen35 = (overrides: Record<string, unknown> = {}) => ({
        'general.architecture': 'qwen35',
        'qwen35.block_count': '8',
        'qwen35.embedding_length': '1024',
        'qwen35.attention.head_count': '8',
        'qwen35.attention.head_count_kv': '2',
        'qwen35.attention.key_length': '256',
        'qwen35.attention.value_length': '256',
        'tokenizer.ggml.tokens.length': 248320,
        ...overrides,
      });
      const ssm = {
        'qwen35.ssm.conv_kernel': '4',
        'qwen35.ssm.state_size': '128',
        'qwen35.ssm.group_count': '16',
        'qwen35.ssm.inner_size': '2048',
      };
      const perLayer = (4 - 1) * (2048 + 2 * 16 * 128) + 128 * 2048;
      const at2k = settings(2048, 'on');

      // Interval 4 over 8 layers leaves 6 recurrent layers.
      expect(need(qwen35(ssm), at2k)).toBe(
        need(qwen35(), at2k) + 6 * perLayer * 4,
      );
    });

    it('marks the layer before each interval boundary as full attention', () => {
      const qwen35 = (overrides: Record<string, unknown>) => ({
        'general.architecture': 'qwen35',
        'qwen35.block_count': '8',
        'qwen35.embedding_length': '1024',
        'qwen35.attention.head_count': '8',
        'qwen35.attention.head_count_kv': '[2, 2, 2, 4, 2, 2, 2, 4]',
        'qwen35.attention.key_length': '256',
        'qwen35.attention.value_length': '256',
        'tokenizer.ggml.tokens.length': 248320,
        ...overrides,
      });
      const at16k = settings(16384, 'on');

      expect(need(qwen35({}), at16k)).toBe(
        need(
          qwen35({
            'qwen35.attention.recurrent_layers': '[1, 1, 1, 0, 1, 1, 1, 0]',
          }),
          at16k,
        ),
      );
    });

    it('counts the feed-forward graph term as 2 x n_ff x ubatch f32', () => {
      const at2k = settings(2048, 'on');

      expect(need(dense({'llama.feed_forward_length': '5120'}), at2k)).toBe(
        need(dense(), at2k) + 2 * 1024 * UB * 4,
      );
    });

    it('counts the mask at 4 B per cell with the attention matrix and 2 B without', () => {
      // Logits dominate the attention matrix here, so only the mask differs.
      expect(
        need(dense(), settings(2048, 'off')) -
          need(dense(), settings(2048, 'on')),
      ).toBe(2048 * UB * (4 - 2));
    });

    it('counts both global and sliding-window cells in the mask', () => {
      const allSwa = {
        'general.architecture': 'gemma3',
        'gemma3.block_count': '6',
        'gemma3.embedding_length': '1024',
        'gemma3.attention.head_count': '8',
        'gemma3.attention.head_count_kv': '1',
        'gemma3.attention.key_length': '256',
        'gemma3.attention.value_length': '256',
        'gemma3.attention.sliding_window': '1024',
        'gemma3.attention.sliding_window_pattern': '0',
        'tokenizer.ggml.tokens.length': 262144,
      };
      const globalCells = 16384;
      const swaCells = 1024 + 512;

      expect(
        need(allSwa, settings(16384, 'off')) -
          need(allSwa, settings(16384, 'on')),
      ).toBe((globalCells + swaCells) * UB * (4 - 2));
    });

    it('treats a sliding-window period of 0 as every layer sliding', () => {
      const gemma3 = (pattern: string) => ({
        'general.architecture': 'gemma3',
        'gemma3.block_count': '6',
        'gemma3.embedding_length': '1024',
        'gemma3.attention.head_count': '8',
        'gemma3.attention.head_count_kv': '1',
        'gemma3.attention.key_length': '256',
        'gemma3.attention.value_length': '256',
        'gemma3.attention.sliding_window': '1024',
        'gemma3.attention.sliding_window_pattern': pattern,
        'tokenizer.ggml.tokens.length': 262144,
      });
      const at16k = settings(16384, 'on');

      expect(need(gemma3('0'), at16k)).toBe(
        need(gemma3('[1, 1, 1, 1, 1, 1]'), at16k),
      );
    });

    it('sizes sliding-window layers with the sliding-window K and V lengths', () => {
      const gemma = (overrides: Record<string, unknown> = {}) => ({
        'general.architecture': 'gemma3',
        'gemma3.block_count': '6',
        'gemma3.embedding_length': '1024',
        'gemma3.attention.head_count': '8',
        'gemma3.attention.head_count_kv': '1',
        'gemma3.attention.key_length': '512',
        'gemma3.attention.value_length': '512',
        'gemma3.attention.sliding_window': '512',
        'tokenizer.ggml.tokens.length': 262144,
        ...overrides,
      });
      const at16k = settings(16384, 'on');
      // Period 6: layers 0-4 slide over min(n_ctx, pad256(512 + 512)) cells.
      const swaLayers = 5;
      const swaCells = 1024;

      expect(
        need(gemma(), at16k) -
          need(
            gemma({
              'gemma3.attention.key_length_swa': '256',
              'gemma3.attention.value_length_swa': '256',
            }),
            at16k,
          ),
      ).toBe(swaLayers * swaCells * ((512 - 256) * 2 + (512 - 256) * 2));
    });

    it('leaves the nextn prediction layers out of the KV cache', () => {
      const at16k = settings(16384, 'on');

      expect(
        need(
          dense({
            'llama.block_count': '5',
            'llama.nextn_predict_layers': '1',
          }),
          at16k,
        ),
      ).toBe(need(dense(), at16k));
    });

    it('takes the size path when corrupt settings would put the need below the file size', () => {
      const modelSize = 1e6;

      expect(
        need(
          dense({'tokenizer.ggml.tokens.length': 1000}),
          settings(2048, 'off', {n_ubatch: -512}),
          modelSize,
        ),
      ).toBe(modelSize * 1.2);
    });
  });

  describe('paired draft', () => {
    const fixtureModel = (
      name: 'Qwen_Qwen3-4B-Q4_K_M' | 'Qwen_Qwen3-1.7B-Q4_K_M',
    ) =>
      ({
        ...baseModel,
        id: name,
        size: ggufFileSize(name),
        ggufMetadata: parseGGUFMetadata(ggufMetadata(name)),
      }) as Model;
    const target = fixtureModel('Qwen_Qwen3-4B-Q4_K_M');
    const draft = fixtureModel('Qwen_Qwen3-1.7B-Q4_K_M');
    const quantizedDraft = {
      ...contextSettings,
      n_ctx: 4096,
      spec_draft_cache_type_k: CacheType.Q8_0,
      spec_draft_cache_type_v: CacheType.Q8_0,
    };
    // Qwen3-1.7B: 28 layers, 8 KV heads, 128-wide K and V, 4096 cells.
    const draftKv = (bytesK: number, bytesV: number) =>
      28 * 4096 * 8 * (128 * bytesK + 128 * bytesV);
    const originalOS = ReactNative.Platform.OS;
    const setOS = (os: string) =>
      Object.defineProperty(ReactNative.Platform, 'OS', {
        get: () => os,
        configurable: true,
      });

    afterEach(() => setOS(originalOS));

    it('resolves an unset flash attention to off, counting the attention matrix', () => {
      setOS('ios');
      const unset = {...quantizedDraft, flash_attn_type: undefined};

      expect(getModelMemoryRequirement(target, undefined, unset, draft)).toBe(
        getModelMemoryRequirement(
          target,
          undefined,
          {...unset, flash_attn_type: 'off'},
          draft,
        ),
      );
      expect(getModelMemoryRequirement(target, undefined, unset)).toBe(
        getModelMemoryRequirement(target, undefined, {
          ...unset,
          flash_attn_type: 'auto',
        }),
      );
    });

    it('adds (draft size + draft KV) x 1.1, with V clamped to f16 when flash attention is off', () => {
      const off = {...quantizedDraft, flash_attn_type: 'off'} as const;

      expect(
        getModelMemoryRequirement(target, undefined, off, draft) -
          getModelMemoryRequirement(target, undefined, off),
      ).toBeCloseTo((draft.size + draftKv(1.0625, 2)) * 1.1, 0);
    });

    it('keeps a quantized draft V when flash attention is on', () => {
      const on = {...quantizedDraft, flash_attn_type: 'on'} as const;

      expect(
        getModelMemoryRequirement(target, undefined, on, draft) -
          getModelMemoryRequirement(target, undefined, on),
      ).toBeCloseTo((draft.size + draftKv(1.0625, 1.0625)) * 1.1, 0);
    });
  });

  describe('purity', () => {
    it('reads neither the store nor native modules', () => {
      const target = {
        ...baseModel,
        size: ggufFileSize('Qwen_Qwen3-4B-Q4_K_M'),
        ggufMetadata: parseGGUFMetadata(ggufMetadata('Qwen_Qwen3-4B-Q4_K_M')),
      } as Model;
      const projector = {size: 300 * 1e6} as Model;
      const estimate = () =>
        getModelMemoryRequirement(target, projector, contextSettings);
      const first = estimate();
      const nativeModules = jest
        .spyOn(ReactNative, 'NativeModules', 'get')
        .mockImplementation(() => {
          throw new Error('native module read');
        });

      Object.assign(modelStore, {
        largestSuccessfulLoad: 1,
        availableMemoryCeiling: 1,
        deviceTier: 'flagship',
        activeModelId: 'another-model',
      });

      expect(estimate()).toBe(first);
      nativeModules.mockRestore();
    });
  });
});
