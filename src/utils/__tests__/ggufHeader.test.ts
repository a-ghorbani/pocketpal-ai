import * as fs from 'fs';
import * as path from 'path';
import {gunzipSync} from 'zlib';
import * as RNFS from '@dr.pogodin/react-native-fs';

import {
  readGGUFHeaderForMTP,
  readLocalGGUFEmbeddingTensors,
} from '../ggufHeader';
import {
  FixtureType,
  GGUFFixture,
  localReadFor,
  rangeFetchFor,
  realignedGGUF,
  tensorInfoEntry,
  tensorInfoFile,
} from './ggufFixture';

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

describe('readLocalGGUFEmbeddingTensors', () => {
  const PATH = '/models/file.gguf';
  const capturedHeader = (name: string) =>
    new Uint8Array(
      gunzipSync(
        fs.readFileSync(
          path.join(
            __dirname,
            '../../../jest/fixtures/gguf-memory/headers',
            `${name}.gguf-header.gz`,
          ),
        ),
      ),
    );
  const captured = (name: string) => {
    const bytes = capturedHeader(name);
    return {
      bytes,
      layout: {version: 3, alignment: 32, dataOffset: bytes.length},
    };
  };
  const scan = ({
    bytes,
    layout,
  }: {
    bytes: Uint8Array;
    layout: {version: number; alignment: number; dataOffset: number};
  }) => {
    (RNFS.read as jest.Mock).mockImplementation(localReadFor(bytes));
    return readLocalGGUFEmbeddingTensors(PATH, layout);
  };
  const tied = [
    tensorInfoEntry({name: 'token_embd.weight', dims: [64, 256], ggmlType: 14}),
    tensorInfoEntry({
      name: 'blk.0.attn_q.weight',
      dims: [64, 64],
      offset: 13440,
    }),
  ];

  afterEach(() => {
    (RNFS.read as jest.Mock).mockReset();
  });

  it('reads a tied embedding from a captured header', async () => {
    await expect(scan(captured('LFM2.5-350M-Q4_K_M'))).resolves.toEqual({
      tokenEmbd: {type: 14, dims: [1024, 65536]},
      hasOutput: false,
    });
  });

  it('sees output.weight in a captured untied header', async () => {
    await expect(
      scan(captured('Phi-3.5-mini-instruct-Q4_K_M')),
    ).resolves.toEqual({
      tokenEmbd: {type: 12, dims: [3072, 32064]},
      hasOutput: true,
    });
  });

  it('reads the prefix and only the tensor-info tail below the data offset', async () => {
    const file = captured('LFM2.5-350M-Q4_K_M');
    const tensorCount = new DataView(file.bytes.buffer).getUint32(8, true);

    await scan(file);

    const calls = (RNFS.read as jest.Mock).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual([PATH, 24, 0, 'base64']);
    const [, length, position] = calls[1];
    expect(length).toBeLessThanOrEqual(tensorCount * 119 + 32);
    expect(position + length).toBe(file.layout.dataOffset);
  });

  it('reads a tail whose window reaches back to the prefix', async () => {
    const file = tensorInfoFile({entries: tied});

    await expect(scan(file)).resolves.toEqual({
      tokenEmbd: {type: 14, dims: [64, 256]},
      hasOutput: false,
    });
    expect((RNFS.read as jest.Mock).mock.calls[1][2]).toBe(24);
  });

  it('reads a section of maximal entries ending a full alignment before the data', async () => {
    const file = tensorInfoFile({
      entries: [tensorInfoEntry({name: 'x'.repeat(63), dims: [1, 1, 1, 1]})],
      kv: new Uint8Array(18),
    });

    const entryStart = file.bytes.indexOf(0x78) - 8;
    expect(file.layout.dataOffset - entryStart).toBe(119 + 31);
    await expect(scan(file)).resolves.toEqual({hasOutput: false});
  });

  it('reads maximal entries with maximal padding through a window of n * 119 + alignment bytes', async () => {
    const entries = Array.from({length: 4}, (_, i) =>
      tensorInfoEntry({
        name: String(i).repeat(63),
        dims: [1, 1, 1, 1],
        offset: i * 32,
      }),
    );
    const file = tensorInfoFile({entries, kv: new Uint8Array(1037)});

    expect(file.layout.dataOffset - (24 + 1037)).toBe(4 * 119 + 31);
    await expect(scan(file)).resolves.toEqual({hasOutput: false});
    expect((RNFS.read as jest.Mock).mock.calls[1][1]).toBe(4 * 119 + 32);
  });

  it('reads a section whose first tensors share data offset 0', async () => {
    const file = tensorInfoFile({
      entries: [
        tensorInfoEntry({name: 'a', dims: [0]}),
        tied[0],
        tensorInfoEntry({name: 'b', offset: 13440}),
      ],
    });

    await expect(scan(file)).resolves.toEqual({
      tokenEmbd: {type: 14, dims: [64, 256]},
      hasOutput: false,
    });
  });

  it('reads a section behind a KV section whose last bytes read as an entry at offset 0', async () => {
    const file = tensorInfoFile({
      entries: tied,
      kv: tensorInfoEntry({name: 'general.name', dims: []}),
    });

    await expect(scan(file)).resolves.toEqual({
      tokenEmbd: {type: 14, dims: [64, 256]},
      hasOutput: false,
    });
  });

  it('passes through dims beyond the safe-integer range for the caller to bound', async () => {
    const file = tensorInfoFile({
      entries: [
        tensorInfoEntry({
          name: 'token_embd.weight',
          dims: [2 ** 40, 2 ** 40],
          ggmlType: 14,
        }),
      ],
    });

    await expect(scan(file)).resolves.toEqual({
      tokenEmbd: {type: 14, dims: [2 ** 40, 2 ** 40]},
      hasOutput: false,
    });
  });

  it.each([
    ['version 1', {version: 1}],
    ['alignment 48', {alignment: 48}],
    ['alignment 8192', {alignment: 8192}],
    ['alignment 0', {alignment: 0}],
    ['data offset 0', {dataOffset: 0}],
    ['data offset 23', {dataOffset: 23}],
    ['data offset 1.5', {dataOffset: 1.5}],
    ['data offset past 64 MiB', {dataOffset: 64 * 1024 * 1024 + 1}],
    ['data offset NaN', {dataOffset: NaN}],
  ])('rejects %s without reading', async (_case, override) => {
    const file = tensorInfoFile({entries: tied});

    await expect(
      scan({...file, layout: {...file.layout, ...override}}),
    ).rejects.toThrow(/out of range/);
    expect(RNFS.read).not.toHaveBeenCalled();
  });

  it.each([
    ['0 tensors', 0],
    ['2049 tensors', 2049],
    ['2^32 tensors', 2 ** 32],
  ])('rejects a prefix with %s', async (_case, tensorCount) => {
    await expect(
      scan(tensorInfoFile({entries: tied, tensorCount})),
    ).rejects.toThrow(/tensor count/);
    expect(RNFS.read).toHaveBeenCalledTimes(1);
  });

  it('rejects a prefix with 2^32 + 2 tensors, whose low word alone would fit', async () => {
    await expect(
      scan(tensorInfoFile({entries: tied, tensorCount: 2 ** 32 + 2})),
    ).rejects.toThrow(/tensor count/);
  });

  it('rejects a prefix without the GGUF magic', async () => {
    const file = tensorInfoFile({entries: tied});
    file.bytes[0] = 0x48;

    await expect(scan(file)).rejects.toThrow(/prefix/);
  });

  it('rejects a prefix whose version differs from the reported one', async () => {
    const file = tensorInfoFile({entries: tied, version: 2});

    await expect(
      scan({...file, layout: {...file.layout, version: 3}}),
    ).rejects.toThrow(/prefix/);
  });

  it('rejects a read that returns fewer bytes than requested', async () => {
    const file = tensorInfoFile({entries: tied});

    await expect(
      scan({...file, bytes: file.bytes.slice(0, file.bytes.length - 1)}),
    ).rejects.toThrow(/fewer bytes/);
  });

  it.each([
    ['a space in a name', 'blk.0.attn q.weight'],
    ['a non-ASCII byte in a name', 'blk.0.attn_\xe9.weight'],
    ['a DEL byte in a name', 'blk.0.attn_\x7f.weight'],
    ['an empty name', ''],
  ])('rejects %s', async (_case, name) => {
    const file = tensorInfoFile({
      entries: [tied[0], tensorInfoEntry({name, offset: 13440})],
    });

    await expect(scan(file)).rejects.toThrow(/no consistent end/);
  });

  it('rejects a name length whose high word is set', async () => {
    const entry = tensorInfoEntry({name: 'blk.0.attn_q.weight', offset: 13440});
    new DataView(entry.buffer).setUint32(4, 1, true);
    const file = tensorInfoFile({entries: [tied[0], entry]});

    await expect(scan(file)).rejects.toThrow(/no consistent end/);
  });

  it('rejects a first tensor whose data offset is not 0', async () => {
    const file = tensorInfoFile({
      entries: [
        tensorInfoEntry({
          name: 'token_embd.weight',
          dims: [64, 256],
          offset: 32,
        }),
      ],
    });

    await expect(scan(file)).rejects.toThrow(/no consistent end/);
  });

  it.each([
    ['decrease from one tensor to the next', [0, 64, 32]],
    ['are not a multiple of the alignment', [0, 48, 64]],
  ])('rejects data offsets that %s', async (_case, offsets) => {
    const file = tensorInfoFile({
      entries: offsets.map((offset, i) =>
        tensorInfoEntry({name: `t${i}`, offset}),
      ),
    });

    await expect(scan(file)).rejects.toThrow(/no consistent end/);
  });

  it('rejects an entry that reads as two layouts', async () => {
    // Dims [8, 4, "abcd"] also read as a scalar named "abcd" whose length
    // prefix is the dim 4.
    const file = tensorInfoFile({
      entries: [
        tied[0],
        tensorInfoEntry({
          name: 'blk.0.ffn_up.weight',
          dims: [8, 4, 0x64636261],
          offset: 13440,
        }),
      ],
    });

    await expect(scan(file)).rejects.toThrow(/no consistent end/);
  });

  it('rejects a window too short for the reported tensor count', async () => {
    await expect(
      scan(tensorInfoFile({entries: tied, tensorCount: 3})),
    ).rejects.toThrow(/no consistent end/);
  });

  it('rejects a tail with two consistent ends', async () => {
    // A one-tensor section ending at byte 57 and a decoy entry ending at the
    // data offset, both within one alignment of it.
    const decoy = tensorInfoEntry({name: 'b'});
    const file = tensorInfoFile({
      entries: [tensorInfoEntry({name: 'a'})],
      alignment: 64,
      padding: Buffer.concat([new Uint8Array(6), decoy]),
    });

    expect(file.layout.dataOffset).toBe(96);
    await expect(scan(file)).rejects.toThrow(/more than one consistent end/);
  });

  it.each([
    ['LFM2.5-350M-Q4_K_M', 64, {type: 14, dims: [1024, 65536]}, false],
    ['LFM2.5-350M-Q4_K_M', 2048, {type: 14, dims: [1024, 65536]}, false],
    ['LFM2.5-350M-Q4_K_M', 4096, {type: 14, dims: [1024, 65536]}, false],
    [
      'Phi-3.5-mini-instruct-Q4_K_M',
      2048,
      {type: 12, dims: [3072, 32064]},
      true,
    ],
  ])(
    'reads the captured %s header rewritten to alignment %i as at 32',
    async (name, alignment, tokenEmbd, hasOutput) => {
      const file = realignedGGUF(capturedHeader(name), alignment);

      expect(file.layout.dataOffset % alignment).toBe(0);
      await expect(scan(file)).resolves.toEqual({tokenEmbd, hasOutput});
    },
  );

  it('reads a crafted tail whose padding is full of entries carrying the last offset', async () => {
    // llama.cpp accepts it: unique names, chained offsets, and padding it
    // never checks.
    const tensorCount = 2048;
    const alignment = 4096;
    const entries = Array.from({length: tensorCount}, (_, i) =>
      i === 0
        ? tensorInfoEntry({
            name: 'token_embd.weight',
            dims: [64, 256],
            ggmlType: 14,
          })
        : tensorInfoEntry({
            name: `t${i.toString(36).padStart(4, '0')}`,
            dims: [],
            offset: i * alignment,
          }),
    );
    const infoLength = entries.reduce((n, e) => n + e.length, 0);
    const kvEnd =
      Math.ceil((24 + infoLength) / alignment) * alignment - infoLength + 1;
    const fake = tensorInfoEntry({
      name: 'A',
      dims: [],
      offset: (tensorCount - 1) * alignment,
    });
    const padding = new Uint8Array(alignment - 1);
    for (let at = 0; at + fake.length <= padding.length; at += fake.length) {
      padding.set(fake, at);
    }
    const file = tensorInfoFile({
      entries,
      alignment,
      kv: new Uint8Array(kvEnd - 24),
      padding,
    });

    await expect(scan(file)).resolves.toEqual({
      tokenEmbd: {type: 14, dims: [64, 256]},
      hasOutput: false,
    });
  });
});
