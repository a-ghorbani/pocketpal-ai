jest.unmock('../../store');
import {loadLlamaModelInfo} from 'llama.rn';
import {runInAction} from 'mobx';
import {Platform} from 'react-native';

import {modelStore} from '..';
import {
  getModelMemoryRequirement,
  MemoryEstimateSettings,
} from '../../utils/memoryEstimator';
import {createDefaultContextInitParams} from '../../utils/contextInitParamsVersions';
import {isMTPCapable} from '../../utils/mtp';
import {
  CacheType,
  ContextInitParams,
  GGUFMetadata,
  Model,
} from '../../utils/types';
import {createModel} from '../../../jest/fixtures/models';
import {
  BufferCapture,
  FlashAttnCapture,
  GGUFMemoryFixture,
  bufferCapture,
  bufferCaptures,
  ggufFileSize,
  ggufMetadata,
} from '../../../jest/fixtures/ggufMemory';

jest.mock('../../services/deviceRules/rules', () => ({
  fetchRules: jest.fn().mockResolvedValue(null),
}));

const GiB = 1024 ** 3;
const OVERHEAD_BYTES_PER_VOCAB_TOKEN = 384;

type FlashAttnSetting = ContextInitParams['flash_attn_type'];

async function downloadedModel(name: GGUFMemoryFixture): Promise<Model> {
  const model = createModel({
    id: name,
    filename: `${name}.gguf`,
    size: ggufFileSize(name),
    isDownloaded: true,
    ggufMetadata: undefined,
  }) as Model;
  (loadLlamaModelInfo as jest.Mock).mockResolvedValueOnce(ggufMetadata(name));
  await modelStore.fetchAndPersistGGUFMetadata(model);
  return model;
}

function settings(
  n_ctx: number,
  flash_attn_type: FlashAttnSetting,
): MemoryEstimateSettings {
  return {
    ...createDefaultContextInitParams(),
    n_ctx,
    n_batch: 512,
    n_ubatch: 512,
    cache_type_k: CacheType.F16,
    cache_type_v: CacheType.F16,
    flash_attn_type,
    state_cache_budget_mb: 0,
  };
}

// The captured `auto` resolved to flash attention on.
const settingFor = (fa: FlashAttnCapture): FlashAttnSetting =>
  fa === 'off' ? 'off' : 'on';

function reference(name: GGUFMemoryFixture, capture: BufferCapture): number {
  const vocab = Number(ggufMetadata(name)['tokenizer.ggml.tokens.length']);
  return (
    capture.model +
    capture.context +
    capture.compute +
    vocab * OVERHEAD_BYTES_PER_VOCAB_TOKEN
  );
}

async function errorAgainst(
  name: GGUFMemoryFixture,
  capture: BufferCapture,
  flashAttn: FlashAttnSetting,
): Promise<number> {
  const model = await downloadedModel(name);
  const estimate = getModelMemoryRequirement(
    model,
    undefined,
    settings(capture.n_ctx, flashAttn),
  );
  return estimate / reference(name, capture) - 1;
}

const FAMILIES: [string, GGUFMemoryFixture][] = [
  ['dense GQA', 'Qwen_Qwen3-1.7B-Q4_K_M'],
  ['dense GQA', 'Qwen_Qwen3-4B-Q4_K_M'],
  ['dense GQA', 'HuggingFaceTB_SmolLM3-3B-Q4_0'],
  ['dense MHA', 'smollm2-1.7b-instruct-q4_k_m'],
  ['dense GQA', 'mistralai_Ministral-3-3B-Instruct-2512-Q4_0'],
  ['Phi-3.5', 'Phi-3.5-mini-instruct-Q4_K_M'],
  ['Phi-4-mini', 'microsoft_Phi-4-mini-instruct-Q4_0'],
  ['Gemma 3 sliding window', 'gemma-3-1b-it-Q4_K_M'],
  ['Gemma 3 sliding window', 'gemma-3-4b-it-Q4_0'],
  ['Gemma 3n shared KV', 'gemma-3n-E2B-it-Q4_K_M'],
  ['Gemma 4 E-series', 'gemma-4-E2B-it-Q4_0'],
  ['Gemma 4 E-series', 'gemma-4-E4B-it-Q4_0'],
  ['hybrid short convolution', 'LFM2.5-350M-Q4_K_M'],
  ['hybrid short convolution', 'LFM2.5-1.2B-Instruct-Q4_K_M'],
  ['hybrid short convolution', 'LFM2-2.6B-Q4_K_M'],
  ['hybrid MoE', 'LFM2.5-8B-A1B-Q4_0'],
  ['hybrid gated delta', 'Qwen3.5-0.8B-Q4_0'],
  ['hybrid gated delta', 'Qwen3.5-2B-Q4_0'],
  ['hybrid gated delta', 'Qwen3.5-4B-Q4_0'],
  ['Qwen3-VL text side', 'Qwen3-VL-2B-Instruct-Q4_K_M'],
];

describe('text-side estimate against llama.cpp buffers', () => {
  const originalOS = Platform.OS;
  const setOS = (os: string) =>
    Object.defineProperty(Platform, 'OS', {
      get: () => os,
      configurable: true,
    });

  beforeEach(() => {
    (loadLlamaModelInfo as jest.Mock).mockReset();
  });

  afterEach(() => setOS(originalOS));

  describe.each(FAMILIES)('%s (%s)', (_family, name) => {
    it.each(bufferCaptures(name).map(c => [c.n_ctx, c.fa, c] as const))(
      'is within -5%/+10% at n_ctx %i, flash attention %s',
      async (_n_ctx, fa, capture) => {
        const error = await errorAgainst(name, capture, settingFor(fa));

        expect(error).toBeGreaterThanOrEqual(-0.05);
        expect(error).toBeLessThanOrEqual(0.1);
      },
    );
  });

  describe('flash attention setting', () => {
    const name: GGUFMemoryFixture = 'LFM2.5-1.2B-Instruct-Q4_K_M';

    it.each<[string, FlashAttnSetting, FlashAttnCapture]>([
      ['android', 'off', 'off'],
      ['android', 'auto', 'off'],
      ['android', undefined, 'off'],
      ['android', 'on', 'auto'],
      ['ios', 'off', 'off'],
      ['ios', 'auto', 'auto'],
      ['ios', undefined, 'auto'],
      ['ios', 'on', 'auto'],
    ])(
      'on %s, %s is measured against the fa=%s capture at 16k',
      async (os, flashAttn, capturedAs) => {
        setOS(os);

        const error = await errorAgainst(
          name,
          bufferCapture(name, 16384, capturedAs),
          flashAttn,
        );

        expect(error).toBeGreaterThanOrEqual(-0.05);
        expect(error).toBeLessThanOrEqual(0.1);
      },
    );
  });

  it('stays at or under what a Galaxy S23 reached for Qwen3-4B Q4_K_M at 3k', async () => {
    const model = await downloadedModel('Qwen_Qwen3-4B-Q4_K_M');

    const estimate = getModelMemoryRequirement(
      model,
      undefined,
      settings(3072, 'off'),
    );

    expect(estimate / GiB).toBeLessThanOrEqual(3.31);
  });
});

describe('metadata stored by an earlier version', () => {
  // What the scalar-only parse stored: a per-layer head_count_kv fell back to
  // head_count, and the vocabulary came from a per-architecture table.
  const lfm2V1: GGUFMetadata = {
    architecture: 'lfm2',
    n_layers: 16,
    n_embd: 2048,
    n_head: 32,
    n_head_kv: 32,
    n_vocab: 65536,
    n_embd_head_k: 64,
    n_embd_head_v: 64,
    context_length: 128000,
  };
  const qwen35V1: GGUFMetadata = {
    architecture: 'qwen35',
    n_layers: 25,
    n_embd: 1024,
    n_head: 8,
    n_head_kv: 2,
    n_vocab: 128000,
    n_embd_head_k: 256,
    n_embd_head_v: 256,
    context_length: 262144,
    nextn_predict_layers: 1,
  };
  const flush = async () => {
    for (let i = 0; i < 5; i++) {
      await new Promise(resolve => setImmediate(resolve));
    }
  };
  const storedModel = (name: GGUFMemoryFixture, stored: GGUFMetadata) => {
    runInAction(() => {
      modelStore.models = [
        createModel({
          id: name,
          filename: `${name}.gguf`,
          size: ggufFileSize(name),
          isDownloaded: true,
          ggufMetadata: stored,
        }) as Model,
      ];
    });
    return modelStore.models[0];
  };
  const backfill = () =>
    (
      modelStore as unknown as {loadMissingGGUFMetadata: () => void}
    ).loadMissingGGUFMetadata();

  beforeEach(() => {
    (loadLlamaModelInfo as jest.Mock).mockReset();
  });

  it('is re-read at launch, and the estimate follows', async () => {
    const model = storedModel('LFM2.5-1.2B-Instruct-Q4_K_M', lfm2V1);
    const before = getModelMemoryRequirement(
      model,
      undefined,
      settings(16384, 'off'),
    );
    (loadLlamaModelInfo as jest.Mock).mockResolvedValueOnce(
      ggufMetadata('LFM2.5-1.2B-Instruct-Q4_K_M'),
    );

    backfill();
    await flush();

    expect(model.ggufMetadata).toMatchObject({
      metadataVersion: 2,
      n_head_kv: 8,
      context_length: 128000,
    });
    expect(
      getModelMemoryRequirement(model, undefined, settings(16384, 'off')),
    ).toBeLessThan(before);
  });

  it('stays readable while the header read is in flight', async () => {
    const model = storedModel('Qwen3.5-0.8B-Q4_0', qwen35V1);
    const stored = model.ggufMetadata;
    let finishRead: (info: Record<string, unknown>) => void = () => {};
    (loadLlamaModelInfo as jest.Mock).mockReturnValueOnce(
      new Promise(resolve => {
        finishRead = resolve;
      }),
    );

    backfill();
    await flush();

    expect(model.ggufMetadata).toBe(stored);
    expect(isMTPCapable(model)).toBe(true);
    expect(model.ggufMetadata?.context_length).toBe(262144);

    finishRead(ggufMetadata('Qwen3.5-0.8B-Q4_0'));
    await flush();

    expect(model.ggufMetadata).toMatchObject({
      metadataVersion: 2,
      nextn_predict_layers: 1,
      context_length: 262144,
    });
  });

  it('is kept when the header read fails', async () => {
    const model = storedModel('Qwen3.5-0.8B-Q4_0', qwen35V1);
    const stored = model.ggufMetadata;
    (loadLlamaModelInfo as jest.Mock).mockRejectedValueOnce(
      new Error('std::runtime_error'),
    );

    backfill();
    await flush();

    expect(model.ggufMetadata).toBe(stored);
  });

  it('is kept unstamped when the header is one the parse now rejects', async () => {
    const tooDeep = {...qwen35V1, n_layers: 513};
    const model = storedModel('Qwen3.5-0.8B-Q4_0', tooDeep);
    const stored = model.ggufMetadata;
    (loadLlamaModelInfo as jest.Mock).mockResolvedValueOnce({
      ...ggufMetadata('Qwen3.5-0.8B-Q4_0'),
      'qwen35.block_count': '513',
    });

    backfill();
    await flush();

    expect(model.ggufMetadata).toBe(stored);
    expect(
      getModelMemoryRequirement(model, undefined, settings(4096, 'off')),
    ).toBe(model.size * 1.2);
  });

  it('is not re-read once current', async () => {
    const model = await downloadedModel('Qwen_Qwen3-4B-Q4_K_M');
    storedModel('Qwen_Qwen3-4B-Q4_K_M', model.ggufMetadata!);

    backfill();
    await flush();

    expect(loadLlamaModelInfo).toHaveBeenCalledTimes(1);
  });
});
