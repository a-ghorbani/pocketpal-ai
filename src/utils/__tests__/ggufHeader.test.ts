import {readGGUFHeaderForMTP} from '../ggufHeader';
import {FixtureType, GGUFFixture, rangeFetchFor} from './ggufFixture';

const URL = 'https://host/file.gguf';

const read = (fixture: GGUFFixture, chunkSize?: number) =>
  readGGUFHeaderForMTP(URL, {
    fetchImpl: rangeFetchFor(fixture.build()) as unknown as typeof fetch,
    chunkSize,
  });

describe('readGGUFHeaderForMTP', () => {
  it('reads a positive nextn_predict_layers KV', async () => {
    const fixture = new GGUFFixture()
      .kv('general.architecture', {type: FixtureType.STRING, value: 'qwen35'})
      .kv('qwen35.nextn_predict_layers', {type: FixtureType.UINT32, value: 1});

    await expect(read(fixture)).resolves.toEqual({
      nextnPredictLayers: 1,
      hasNextnTensor: false,
    });
  });

  it('falls back to nextn tensor names when the KV is absent', async () => {
    const fixture = new GGUFFixture()
      .kv('general.architecture', {type: FixtureType.STRING, value: 'qwen35'})
      .tensor('blk.0.attn_q.weight')
      .tensor('blk.0.nextn.embed_tokens.weight');

    await expect(read(fixture)).resolves.toEqual({
      nextnPredictLayers: 0,
      hasNextnTensor: true,
    });
  });

  it('reports neither for a plain model', async () => {
    const fixture = new GGUFFixture()
      .kv('general.architecture', {type: FixtureType.STRING, value: 'gemma4'})
      .kv('gemma4.embedding_length', {type: FixtureType.UINT32, value: 2048})
      .tensor('blk.0.attn_q.weight')
      .tensor('output_norm.weight');

    await expect(read(fixture)).resolves.toEqual({
      nextnPredictLayers: 0,
      hasNextnTensor: false,
    });
  });

  it('seeks past a tokenizer-scale vocab to a KV declared after it', async () => {
    // The whole point of the bespoke reader: the vocab is skipped by length
    // prefixes, never decoded, and a KV that follows it is still found.
    const vocab = Array.from({length: 20000}, (_, i) => `token_${i}`);
    const merges = Array.from({length: 10000}, (_, i) => `m${i} g${i}`);
    const fixture = new GGUFFixture()
      .kv('tokenizer.ggml.tokens', {
        type: FixtureType.ARRAY,
        elemType: FixtureType.STRING,
        values: vocab,
      })
      .kv('tokenizer.ggml.merges', {
        type: FixtureType.ARRAY,
        elemType: FixtureType.STRING,
        values: merges,
      })
      .kv('rope.freqs', {
        type: FixtureType.ARRAY,
        elemType: FixtureType.FLOAT32,
        values: Array.from({length: 64}, (_, i) => i / 64),
      })
      .kv('qwen35.nextn_predict_layers', {type: FixtureType.UINT32, value: 3});

    await expect(read(fixture)).resolves.toEqual({
      nextnPredictLayers: 3,
      hasNextnTensor: false,
    });
  });

  it('accepts the KV in any integer width', async () => {
    for (const type of [FixtureType.INT32, FixtureType.UINT64] as const) {
      const fixture = new GGUFFixture().kv('arch.nextn_predict_layers', {
        type,
        value: 2,
      } as any);
      await expect(read(fixture)).resolves.toEqual({
        nextnPredictLayers: 2,
        hasNextnTensor: false,
      });
    }
  });

  it('treats an explicit zero KV as no capability but still checks tensors', async () => {
    const fixture = new GGUFFixture()
      .kv('arch.nextn_predict_layers', {type: FixtureType.UINT32, value: 0})
      .tensor('blk.0.nextn.shared_head.weight');

    await expect(read(fixture)).resolves.toEqual({
      nextnPredictLayers: 0,
      hasNextnTensor: true,
    });
  });

  it('reads v1 and v2 headers (32-bit and 64-bit lengths)', async () => {
    for (const version of [1, 2] as const) {
      const fixture = new GGUFFixture(version)
        .kv('general.architecture', {type: FixtureType.STRING, value: 'llama'})
        .kv('llama.nextn_predict_layers', {type: FixtureType.UINT32, value: 4})
        .tensor('blk.0.attn_q.weight', [16, 16]);
      await expect(read(fixture)).resolves.toEqual({
        nextnPredictLayers: 4,
        hasNextnTensor: false,
      });
    }
  });

  it('is chunking-independent: a tiny chunk size yields the same result', async () => {
    const fixture = new GGUFFixture()
      .kv('tokenizer.ggml.tokens', {
        type: FixtureType.ARRAY,
        elemType: FixtureType.STRING,
        values: Array.from({length: 500}, (_, i) => `token_${i}`),
      })
      .kv('qwen35.nextn_predict_layers', {type: FixtureType.UINT32, value: 1});
    const fetchImpl = rangeFetchFor(fixture.build());

    await expect(
      readGGUFHeaderForMTP(URL, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        chunkSize: 64,
      }),
    ).resolves.toEqual({nextnPredictLayers: 1, hasNextnTensor: false});
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1);
  });

  it('rejects a non-GGUF payload', async () => {
    const junk = new TextEncoder().encode('PK definitely a zip');
    await expect(
      readGGUFHeaderForMTP(URL, {
        fetchImpl: rangeFetchFor(junk) as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/bad magic/);
  });

  it('rejects a truncated header instead of misreading it', async () => {
    const bytes = new GGUFFixture()
      .kv('qwen35.nextn_predict_layers', {type: FixtureType.UINT32, value: 1})
      .build()
      .slice(0, 18);
    await expect(
      readGGUFHeaderForMTP(URL, {
        fetchImpl: rangeFetchFor(bytes) as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/truncated/);
  });

  it('needs no TextDecoder global (the Hermes gap that broke the old probe)', async () => {
    const nativeTextDecoder = globalThis.TextDecoder;
    // @ts-expect-error deleting a global to simulate the Hermes runtime
    delete globalThis.TextDecoder;
    try {
      const fixture = new GGUFFixture()
        .kv('general.architecture', {type: FixtureType.STRING, value: 'qwen35'})
        .kv('qwen35.nextn_predict_layers', {
          type: FixtureType.UINT32,
          value: 1,
        });
      await expect(read(fixture)).resolves.toEqual({
        nextnPredictLayers: 1,
        hasNextnTensor: false,
      });
    } finally {
      globalThis.TextDecoder = nativeTextDecoder;
    }
  });
});
