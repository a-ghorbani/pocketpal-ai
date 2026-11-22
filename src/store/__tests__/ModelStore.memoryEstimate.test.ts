jest.unmock('../../store');
import {loadLlamaModelInfo} from 'llama.rn';

import {modelStore} from '..';
import {
  getModelMemoryRequirement,
  MemoryEstimateSettings,
} from '../../utils/memoryEstimator';
import {createDefaultContextInitParams} from '../../utils/contextInitParamsVersions';
import {CacheType, Model} from '../../utils/types';
import {createModel} from '../../../jest/fixtures/models';
import {
  BufferCapture,
  GGUFMemoryFixture,
  bufferCapture,
  ggufFileSize,
  ggufMetadata,
} from '../../../jest/fixtures/ggufMemory';

jest.mock('../../services/deviceRules/rules', () => ({
  fetchRules: jest.fn().mockResolvedValue(null),
}));

const GiB = 1024 ** 3;
const OVERHEAD_BYTES_PER_VOCAB_TOKEN = 384;

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

function settings(n_ctx: number, fa: 'off' | 'auto'): MemoryEstimateSettings {
  return {
    ...createDefaultContextInitParams(),
    n_ctx,
    n_batch: 512,
    n_ubatch: 512,
    cache_type_k: CacheType.F16,
    cache_type_v: CacheType.F16,
    flash_attn_type: fa === 'off' ? 'off' : 'on',
    state_cache_budget_mb: 0,
  };
}

function reference(name: GGUFMemoryFixture, capture: BufferCapture): number {
  const vocab = Number(ggufMetadata(name)['tokenizer.ggml.tokens.length']);
  return (
    capture.model +
    capture.context +
    capture.compute +
    vocab * OVERHEAD_BYTES_PER_VOCAB_TOKEN
  );
}

async function errorAgainstLlamaCpp(
  name: GGUFMemoryFixture,
  n_ctx: number,
  fa: 'off' | 'auto',
): Promise<number> {
  const model = await downloadedModel(name);
  const estimate = getModelMemoryRequirement(
    model,
    undefined,
    settings(n_ctx, fa),
  );
  return estimate / reference(name, bufferCapture(name, n_ctx, fa)) - 1;
}

describe('text-side estimate against llama.cpp buffers', () => {
  beforeEach(() => {
    (loadLlamaModelInfo as jest.Mock).mockReset();
  });

  describe.each<[string, GGUFMemoryFixture]>([
    ['dense GQA', 'Qwen_Qwen3-4B-Q4_K_M'],
    ['hybrid short convolution', 'LFM2.5-1.2B-Instruct-Q4_K_M'],
  ])('%s (%s)', (_family, name) => {
    it.each([
      [2048, 'off'],
      [16384, 'off'],
      [2048, 'auto'],
      [16384, 'auto'],
    ] as const)(
      'is within -5%/+10% at n_ctx %i, flash attention %s',
      async (n_ctx, fa) => {
        const error = await errorAgainstLlamaCpp(name, n_ctx, fa);

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
