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
