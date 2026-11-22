jest.unmock('../../store');
import * as fs from 'fs';
import * as path from 'path';
import {gunzipSync} from 'zlib';
import * as RNFS from '@dr.pogodin/react-native-fs';
import {loadLlamaModelInfo} from 'llama.rn';
import {runInAction} from 'mobx';
import {Platform} from 'react-native';

import {modelStore} from '..';
import {
  getModelMemoryRequirement,
  MemoryEstimateSettings,
} from '../../utils/memoryEstimator';
import {readLocalGGUFEmbeddingTensors} from '../../utils/ggufHeader';
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
  WrittenCapture,
  bufferCapture,
  bufferCaptures,
  embeddingTensors,
  ggufFileSize,
  ggufMetadata,
  tiedCopyBytes,
  writtenCapture,
  writtenCaptures,
} from '../../../jest/fixtures/ggufMemory';
import {localReadFor} from '../../utils/__tests__/ggufFixture';

jest.mock('../../services/deviceRules/rules', () => ({
  fetchRules: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../utils/ggufHeader', () => ({
  ...jest.requireActual('../../utils/ggufHeader'),
  readLocalGGUFEmbeddingTensors: jest.fn(),
}));

const GiB = 1024 ** 3;
const OVERHEAD_BYTES_PER_VOCAB_TOKEN = 384;

type FlashAttnSetting = ContextInitParams['flash_attn_type'];

const originalOS = Platform.OS;
const setOS = (os: string) =>
  Object.defineProperty(Platform, 'OS', {
    get: () => os,
    configurable: true,
  });

async function downloadedModel(name: GGUFMemoryFixture): Promise<Model> {
  const model = createModel({
    id: name,
    filename: `${name}.gguf`,
    size: ggufFileSize(name),
    isDownloaded: true,
    ggufMetadata: undefined,
  }) as Model;
  (loadLlamaModelInfo as jest.Mock).mockResolvedValueOnce(ggufMetadata(name));
  (readLocalGGUFEmbeddingTensors as jest.Mock).mockResolvedValue(
    embeddingTensors(name),
  );
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
    no_extra_bufts: false,
    state_cache_budget_mb: 0,
  };
}

// The captured `auto` resolved to flash attention on.
const settingFor = (fa: FlashAttnCapture): FlashAttnSetting =>
  fa === 'off' ? 'off' : 'on';

const overhead = (name: GGUFMemoryFixture) =>
  Number(ggufMetadata(name)['tokenizer.ggml.tokens.length']) *
  OVERHEAD_BYTES_PER_VOCAB_TOKEN;

// What an Android CPU load holds: the buffers, the tied embedding's second
// copy, and the compute the fill wrote.
const androidReference = (name: GGUFMemoryFixture, capture: WrittenCapture) =>
  capture.model +
  tiedCopyBytes(name) +
  capture.context +
  capture.compute +
  overhead(name);

// What Metal holds: the buffers as reserved.
const iosReference = (name: GGUFMemoryFixture, capture: BufferCapture) =>
  capture.model + capture.context + capture.compute + overhead(name);

async function errorAgainst(
  name: GGUFMemoryFixture,
  n_ctx: number,
  flashAttn: FlashAttnSetting,
  reference: number,
): Promise<number> {
  const model = await downloadedModel(name);
  const estimate = getModelMemoryRequirement(
    model,
    undefined,
    settings(n_ctx, flashAttn),
  );
  return estimate / reference - 1;
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

const expectInBand = (error: number) => {
  expect(error).toBeGreaterThanOrEqual(-0.05);
  expect(error).toBeLessThanOrEqual(0.1);
};

describe('text-side estimate against llama.cpp', () => {
  beforeEach(() => {
    (loadLlamaModelInfo as jest.Mock).mockReset();
    (readLocalGGUFEmbeddingTensors as jest.Mock).mockReset();
  });

  afterEach(() => setOS(originalOS));

  describe('on Android, against written compute and the tied copy', () => {
    beforeEach(() => setOS('android'));

    describe.each(FAMILIES)('%s (%s)', (_family, name) => {
      it.each(writtenCaptures(name).map(c => [c.n_ctx, c.fa, c] as const))(
        'is within -5%/+10% at n_ctx %i, flash attention %s',
        async (n_ctx, fa, capture) => {
          expectInBand(
            await errorAgainst(
              name,
              n_ctx,
              fa,
              androidReference(name, capture),
            ),
          );
        },
      );
    });
  });

  describe('on iOS, against reserved buffers', () => {
    beforeEach(() => setOS('ios'));

    describe.each(FAMILIES)('%s (%s)', (_family, name) => {
      it.each(bufferCaptures(name).map(c => [c.n_ctx, c.fa, c] as const))(
        'is within -5%/+10% at n_ctx %i, flash attention %s',
        async (n_ctx, fa, capture) => {
          expectInBand(
            await errorAgainst(
              name,
              n_ctx,
              settingFor(fa),
              iosReference(name, capture),
            ),
          );
        },
      );
    });
  });

  describe('flash attention setting', () => {
    const name: GGUFMemoryFixture = 'LFM2.5-1.2B-Instruct-Q4_K_M';

    it.each<[FlashAttnSetting, 'off' | 'on']>([
      ['off', 'off'],
      ['auto', 'off'],
      [undefined, 'off'],
      ['on', 'on'],
    ])(
      'on android, %s is measured against the fa=%s fill at 16k',
      async (flashAttn, filledAs) => {
        setOS('android');

        expectInBand(
          await errorAgainst(
            name,
            16384,
            flashAttn,
            androidReference(name, writtenCapture(name, 16384, filledAs)),
          ),
        );
      },
    );

    it.each<[FlashAttnSetting, FlashAttnCapture]>([
      ['off', 'off'],
      ['auto', 'auto'],
      [undefined, 'auto'],
      ['on', 'auto'],
    ])(
      'on ios, %s is measured against the fa=%s buffers at 16k',
      async (flashAttn, capturedAs) => {
        setOS('ios');

        expectInBand(
          await errorAgainst(
            name,
            16384,
            flashAttn,
            iosReference(name, bufferCapture(name, 16384, capturedAs)),
          ),
        );
      },
    );
  });

  it('stays at or under the previous estimate for Qwen3-4B Q4_K_M at 3k on Android', async () => {
    setOS('android');
    const model = await downloadedModel('Qwen_Qwen3-4B-Q4_K_M');
    // (weights + whole-model KV + (vocab + embd) x 512 x 4) x 1.1
    const previousEstimate = 3593340960;

    const estimate = getModelMemoryRequirement(
      model,
      undefined,
      settings(3072, 'off'),
    );

    expect(estimate).toBeLessThanOrEqual(previousEstimate);
    expect(estimate / GiB).toBeCloseTo(3.34, 2);
  });
});

describe('tensor scan through the metadata read', () => {
  const header = new Uint8Array(
    gunzipSync(
      fs.readFileSync(
        path.join(
          __dirname,
          '../../../jest/fixtures/gguf-memory/headers/LFM2.5-350M-Q4_K_M.gguf-header.gz',
        ),
      ),
    ),
  );
  const name: GGUFMemoryFixture = 'LFM2.5-350M-Q4_K_M';
  const read = async (layout: Record<string, number> = {}) => {
    const model = createModel({
      id: name,
      filename: `${name}.gguf`,
      size: ggufFileSize(name),
      isDownloaded: true,
      ggufMetadata: undefined,
    }) as Model;
    (loadLlamaModelInfo as jest.Mock).mockResolvedValueOnce({
      ...ggufMetadata(name),
      ...layout,
    });
    await modelStore.fetchAndPersistGGUFMetadata(model);
    return model;
  };

  beforeEach(() => {
    (loadLlamaModelInfo as jest.Mock).mockReset();
    (readLocalGGUFEmbeddingTensors as jest.Mock).mockImplementation(
      jest.requireActual('../../utils/ggufHeader')
        .readLocalGGUFEmbeddingTensors,
    );
    setOS('android');
  });

  afterEach(() => {
    (RNFS.read as jest.Mock).mockReset();
    (readLocalGGUFEmbeddingTensors as jest.Mock).mockReset();
    setOS(originalOS);
  });

  it('stores the tied copy read from the local header with the metadata', async () => {
    (RNFS.read as jest.Mock).mockImplementation(localReadFor(header));

    const model = await read();

    expect(model.ggufMetadata).toMatchObject({
      metadataVersion: 2,
      n_vocab: 65536,
      tied_embd_bytes: 1024 * 65536 * (210 / 256),
    });
  });

  it('reads the prefix and the tensor-info tail, nothing more', async () => {
    (RNFS.read as jest.Mock).mockImplementation(localReadFor(header));

    await read();

    const calls = (RNFS.read as jest.Mock).mock.calls;
    const tailLength = calls[1][1];
    const tensorCount = new DataView(header.buffer).getUint32(8, true);
    expect(calls.map(([, length, position]) => [length, position])).toEqual([
      [24, 0],
      [tailLength, ggufMetadata(name).data_offset - tailLength],
    ]);
    expect(tailLength).toBeLessThanOrEqual(tensorCount * 119 + 32);
  });

  it('runs no scan on iOS and stores no tied copy', async () => {
    setOS('ios');
    (RNFS.read as jest.Mock).mockImplementation(localReadFor(header));

    const model = await read();

    expect(RNFS.read).not.toHaveBeenCalled();
    expect(model.ggufMetadata).toMatchObject({metadataVersion: 2});
    expect(model.ggufMetadata?.tied_embd_bytes).toBeUndefined();
  });

  it('keeps the metadata, without the field, when the scan fails, and counts the Q8_0 bound', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (RNFS.read as jest.Mock).mockImplementation(
      localReadFor(header.slice(0, 4096)),
    );

    const model = await read();
    const withBound = getModelMemoryRequirement(
      model,
      undefined,
      settings(2048, 'off'),
    );
    const scanned = {
      ...model,
      ggufMetadata: {
        ...model.ggufMetadata!,
        tied_embd_bytes: 1024 * 65536 * (210 / 256),
      },
    };

    expect(model.ggufMetadata).toMatchObject({metadataVersion: 2});
    expect(model.ggufMetadata).not.toHaveProperty('tied_embd_bytes', 0);
    expect(model.ggufMetadata?.tied_embd_bytes).toBeUndefined();
    expect(
      withBound -
        getModelMemoryRequirement(scanned, undefined, settings(2048, 'off')),
    ).toBeCloseTo(65536 * 1024 * (34 / 32) - 1024 * 65536 * (210 / 256), 0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('tensor scan failed'),
      expect.any(Error),
    );
    warn.mockRestore();
  });

  it.each([
    ['version 1', {version: 1}],
    ['alignment 48', {alignment: 48}],
    ['alignment 2048', {alignment: 2048}],
    ['data offset past 64 MiB', {data_offset: 64 * 1024 * 1024 + 32}],
    [
      'a data offset inside the tensor-info section',
      {data_offset: 2386656 - 32},
    ],
  ])(
    'keeps the metadata, without the field, for a reported %s',
    async (_case, layout) => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      (RNFS.read as jest.Mock).mockImplementation(localReadFor(header));

      const model = await read(layout);

      expect(model.ggufMetadata).toMatchObject({metadataVersion: 2});
      expect(model.ggufMetadata?.tied_embd_bytes).toBeUndefined();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('tensor scan failed'),
        expect.any(Error),
      );
      warn.mockRestore();
    },
  );
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
