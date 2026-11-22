jest.unmock('../../store');
import {loadLlamaModelInfo} from 'llama.rn';
import {Platform} from 'react-native';

import {modelStore} from '..';
import {
  getModelMemoryRequirement,
  MemoryEstimateSettings,
} from '../../utils/memoryEstimator';
import {createDefaultContextInitParams} from '../../utils/contextInitParamsVersions';
import {CacheType, ContextInitParams, Model} from '../../utils/types';
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
