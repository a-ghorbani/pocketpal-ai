/**
 * Builds real GGUF header bytes for reader tests, and a Range-aware fetch
 * mock that serves them the way a CDN would. Kept byte-accurate to the GGUF
 * spec (v2/v3 64-bit lengths, v1 32-bit) so the tests exercise the actual
 * wire format rather than a paraphrase of it.
 */

export const enum FixtureType {
  UINT8 = 0,
  INT8 = 1,
  UINT16 = 2,
  INT16 = 3,
  UINT32 = 4,
  INT32 = 5,
  FLOAT32 = 6,
  BOOL = 7,
  STRING = 8,
  ARRAY = 9,
  UINT64 = 10,
  INT64 = 11,
  FLOAT64 = 12,
}

type KVValue =
  | {type: FixtureType.UINT32; value: number}
  | {type: FixtureType.INT32; value: number}
  | {type: FixtureType.UINT64; value: number}
  | {type: FixtureType.FLOAT32; value: number}
  | {type: FixtureType.BOOL; value: boolean}
  | {type: FixtureType.STRING; value: string}
  | {
      type: FixtureType.ARRAY;
      elemType: FixtureType;
      values: (string | number)[];
    };

interface TensorEntry {
  name: string;
  dims?: number[];
}

export class GGUFFixture {
  private kvs: Array<{key: string; value: KVValue}> = [];
  private tensors: TensorEntry[] = [];

  constructor(private readonly version: 1 | 2 | 3 = 3) {}

  kv(key: string, value: KVValue): this {
    this.kvs.push({key, value});
    return this;
  }

  tensor(name: string, dims: number[] = [1]): this {
    this.tensors.push({name, dims});
    return this;
  }

  build(): Uint8Array {
    const parts: number[] = [];
    const pushU32 = (v: number) => {
      parts.push(
        v & 0xff,
        (v >>> 8) & 0xff,
        (v >>> 16) & 0xff,
        (v >>> 24) & 0xff,
      );
    };
    const pushU64 = (v: number) => {
      let big = BigInt(v);
      for (let i = 0; i < 8; i++) {
        parts.push(Number(big & 0xffn));
        big >>= 8n;
      }
    };
    const pushLen = (v: number) =>
      this.version === 1 ? pushU32(v) : pushU64(v);
    const pushStr = (s: string) => {
      const bytes = Array.from(new TextEncoder().encode(s));
      pushLen(bytes.length);
      parts.push(...bytes);
    };
    const pushF32 = (v: number) => {
      const buf = new DataView(new ArrayBuffer(4));
      buf.setFloat32(0, v, true);
      for (let i = 0; i < 4; i++) {
        parts.push(buf.getUint8(i));
      }
    };
    const pushValue = (value: KVValue) => {
      switch (value.type) {
        case FixtureType.UINT32:
        case FixtureType.INT32:
          pushU32(value.value >>> 0);
          break;
        case FixtureType.UINT64:
          pushU64(value.value);
          break;
        case FixtureType.FLOAT32:
          pushF32(value.value);
          break;
        case FixtureType.BOOL:
          parts.push(value.value ? 1 : 0);
          break;
        case FixtureType.STRING:
          pushStr(value.value);
          break;
        case FixtureType.ARRAY:
          pushU32(value.elemType);
          pushLen(value.values.length);
          for (const v of value.values) {
            if (value.elemType === FixtureType.STRING) {
              pushStr(v as string);
            } else if (value.elemType === FixtureType.FLOAT32) {
              pushF32(v as number);
            } else if (value.elemType === FixtureType.UINT64) {
              pushU64(v as number);
            } else {
              pushU32((v as number) >>> 0);
            }
          }
          break;
      }
    };

    // magic "GGUF", version, tensor count, kv count
    parts.push(0x47, 0x47, 0x55, 0x46);
    pushU32(this.version);
    pushLen(this.tensors.length);
    pushLen(this.kvs.length);

    for (const {key, value} of this.kvs) {
      pushStr(key);
      pushU32(value.type);
      pushValue(value);
    }

    for (const {name, dims = [1]} of this.tensors) {
      pushStr(name);
      pushU32(dims.length);
      for (const d of dims) {
        if (this.version === 1) {
          pushU32(d);
        } else {
          pushU64(d);
        }
      }
      pushU32(0); // dtype
      pushU64(0); // data offset
    }

    return Uint8Array.from(parts);
  }
}

/** A fetch mock that honors Range headers over the fixture bytes. */
export const rangeFetchFor = (bytes: Uint8Array): jest.Mock =>
  jest.fn(async (_url: string, init?: {headers?: Record<string, string>}) => {
    const range = init?.headers?.Range ?? 'bytes=0-';
    const match = /bytes=(\d+)-(\d+)?/.exec(range);
    const from = Number(match?.[1] ?? 0);
    const to = match?.[2] !== undefined ? Number(match[2]) : bytes.length - 1;
    const slice = bytes.slice(from, Math.min(to + 1, bytes.length));
    return {
      ok: true,
      status: 206,
      arrayBuffer: async () =>
        slice.buffer.slice(
          slice.byteOffset,
          slice.byteOffset + slice.byteLength,
        ),
    };
  });

/** An `RNFS.read(path, length, position, 'base64')` mock over the bytes. */
export const localReadFor =
  (bytes: Uint8Array) =>
  async (_path: string, length: number, position: number) =>
    Buffer.from(bytes.subarray(position, position + length)).toString('base64');

export interface TensorInfoEntry {
  name: string;
  dims?: number[];
  ggmlType?: number;
  offset?: number;
}

/** One tensor-info entry as GGUF v2/v3 writes it. */
export const tensorInfoEntry = ({
  name,
  dims = [1],
  ggmlType = 0,
  offset = 0,
}: TensorInfoEntry): Uint8Array => {
  const nameBytes = Buffer.from(name, 'latin1');
  const out = new DataView(
    new ArrayBuffer(8 + nameBytes.length + 4 + 8 * dims.length + 12),
  );
  let at = 0;
  const u32 = (v: number) => {
    out.setUint32(at, v, true);
    at += 4;
  };
  const u64 = (v: number) => {
    out.setBigUint64(at, BigInt(v), true);
    at += 8;
  };
  u64(nameBytes.length);
  nameBytes.forEach(b => out.setUint8(at++, b));
  u32(dims.length);
  dims.forEach(u64);
  u32(ggmlType);
  u64(offset);
  return new Uint8Array(out.buffer);
};

/**
 * A GGUF that ends at its data offset: the 24-byte prefix, `kv` filler bytes
 * standing in for the KV section, the tensor-info `entries`, then `padding`
 * (zeros up to `alignment` unless given). `tensorCount` defaults to the
 * number of entries.
 */
export const tensorInfoFile = ({
  entries,
  alignment = 32,
  version = 3,
  tensorCount = entries.length,
  kv = new Uint8Array(0),
  padding,
}: {
  entries: Uint8Array[];
  alignment?: number;
  version?: number;
  tensorCount?: number;
  kv?: Uint8Array;
  padding?: Uint8Array;
}) => {
  const prefix = new DataView(new ArrayBuffer(24));
  prefix.setUint32(0, 0x46554747, true);
  prefix.setUint32(4, version, true);
  prefix.setBigUint64(8, BigInt(tensorCount), true);
  const infoEnd = 24 + kv.length + entries.reduce((n, e) => n + e.length, 0);
  const pad =
    padding ??
    new Uint8Array(Math.ceil(infoEnd / alignment) * alignment - infoEnd);
  const bytes = Buffer.concat([
    new Uint8Array(prefix.buffer),
    kv,
    ...entries,
    pad,
  ]);
  return {
    bytes: new Uint8Array(bytes),
    layout: {version, alignment, dataOffset: bytes.length},
  };
};

const SCALAR_BYTES: Record<number, number> = {
  [FixtureType.UINT8]: 1,
  [FixtureType.INT8]: 1,
  [FixtureType.UINT16]: 2,
  [FixtureType.INT16]: 2,
  [FixtureType.UINT32]: 4,
  [FixtureType.INT32]: 4,
  [FixtureType.FLOAT32]: 4,
  [FixtureType.BOOL]: 1,
  [FixtureType.UINT64]: 8,
  [FixtureType.INT64]: 8,
  [FixtureType.FLOAT64]: 8,
};

/**
 * A v2/v3 GGUF header that ends at its data offset, rewritten the way a
 * writer would emit it with `general.alignment` = `alignment`: the KV set,
 * data offsets moved to multiples of it, and zeros up to the next multiple.
 */
export const realignedGGUF = (bytes: Uint8Array, alignment: number) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u64 = (at: number) => Number(view.getBigUint64(at, true));
  let at = 24;
  const skip = (type: number) => {
    if (type === FixtureType.STRING) {
      at += 8 + u64(at);
    } else if (type === FixtureType.ARRAY) {
      const elemType = view.getUint32(at, true);
      const length = u64(at + 4);
      at += 12;
      for (let i = 0; i < length; i++) {
        skip(elemType);
      }
    } else {
      at += SCALAR_BYTES[type];
    }
  };
  const kvs: Uint8Array[] = [];
  const kvCount = u64(16);
  for (let i = 0; i < kvCount; i++) {
    const start = at;
    const key = Buffer.from(
      bytes.subarray(at + 8, at + 8 + u64(at)),
    ).toString();
    at += 8 + key.length;
    const type = view.getUint32(at, true);
    at += 4;
    skip(type);
    if (key !== 'general.alignment') {
      kvs.push(bytes.subarray(start, at));
    }
  }
  const alignmentKV = new DataView(new ArrayBuffer(8 + 17 + 8));
  alignmentKV.setBigUint64(0, 17n, true);
  Buffer.from('general.alignment').forEach((b, i) =>
    alignmentKV.setUint8(8 + i, b),
  );
  alignmentKV.setUint32(25, FixtureType.UINT32, true);
  alignmentKV.setUint32(29, alignment, true);
  kvs.push(new Uint8Array(alignmentKV.buffer));

  const entries: Uint8Array[] = [];
  const offsets: number[] = [];
  const tensorCount = u64(8);
  for (let i = 0; i < tensorCount; i++) {
    const start = at;
    at += 8 + u64(at);
    at += 4 + 8 * view.getUint32(at, true) + 4 + 8;
    offsets.push(u64(at - 8));
    entries.push(new Uint8Array(bytes.subarray(start, at)));
  }
  const padTo = (n: number) => Math.ceil(n / alignment) * alignment;
  let offset = 0;
  entries.forEach((entry, i) => {
    new DataView(entry.buffer).setBigUint64(
      entry.length - 8,
      BigInt(offset),
      true,
    );
    if (i + 1 < entries.length) {
      offset += padTo(offsets[i + 1] - offsets[i]);
    }
  });

  const prefix = new Uint8Array(bytes.subarray(0, 24));
  new DataView(prefix.buffer).setBigUint64(16, BigInt(kvs.length), true);
  const body = Buffer.concat([prefix, ...kvs, ...entries]);
  const out = new Uint8Array(padTo(body.length));
  out.set(body);
  return {
    bytes: out,
    layout: {
      version: view.getUint32(4, true),
      alignment,
      dataOffset: out.length,
    },
  };
};
