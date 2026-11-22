/**
 * Minimal GGUF header reader for the remote MTP capability probe.
 *
 * Reads just enough of a remote GGUF file, over plain HTTP range requests, to
 * answer one question: does this model carry MTP draft layers (the
 * `<arch>.nextn_predict_layers` KV, or `nextn.*` tensors from converters that
 * write the layers but omit the KV)?
 *
 * A general-purpose parser must materialize every metadata value — including
 * the ~10^5-string tokenizer vocab that dominates a header — before the caller
 * can look at any of it. This reader instead *seeks past* every value it does
 * not need using GGUF's length-prefixed encoding, so the vocab is walked with
 * integer reads only: no string materialization, no `TextDecoder` (Hermes has
 * none), a few short ASCII-range key decodes instead of ~10^6 of them.
 *
 * GGUF is little-endian, versioned (v1 uses 32-bit lengths, v2/v3 64-bit),
 * and frozen at the container level: llama.cpp cannot change the layout
 * without breaking every reader in the ecosystem. Any structural anomaly
 * throws — the probe maps that to `unknown`, never to a false negative.
 *
 * `readLocalGGUFEmbeddingTensors` reads a downloaded file's embedding tensor
 * descriptors, which `loadLlamaModelInfo` does not return.
 */

import * as RNFS from '@dr.pogodin/react-native-fs';
import {toByteArray} from 'base64-js';

const GGUF_MAGIC = 0x46554747; // "GGUF" read as LE u32

const HTTP_CHUNK_SIZE = 2 * 1024 * 1024;
const HTTP_TOTAL_MAX = 64 * 1024 * 1024;

const MAX_KV_COUNT = 4096;
const MAX_TENSOR_COUNT = 65536;
const MAX_KEY_LENGTH = 4096;
const MAX_ARRAY_COUNT = 32 * 1024 * 1024;
const MAX_ARRAY_DEPTH = 4;

// GGUF metadata value types.
const enum GGUFType {
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

const FIXED_SIZES: Partial<Record<number, number>> = {
  [GGUFType.UINT8]: 1,
  [GGUFType.INT8]: 1,
  [GGUFType.BOOL]: 1,
  [GGUFType.UINT16]: 2,
  [GGUFType.INT16]: 2,
  [GGUFType.UINT32]: 4,
  [GGUFType.INT32]: 4,
  [GGUFType.FLOAT32]: 4,
  [GGUFType.UINT64]: 8,
  [GGUFType.INT64]: 8,
  [GGUFType.FLOAT64]: 8,
};

export interface GGUFHeaderProbeResult {
  nextnPredictLayers: number;
  hasNextnTensor: boolean;
}

export interface ReadGGUFHeaderOptions {
  fetchImpl?: typeof fetch;
  chunkSize?: number;
}

/** Sequential-prefix buffer over HTTP range requests. */
class ChunkedReader {
  private bytes = new Uint8Array(0);
  private view = new DataView(new ArrayBuffer(0));
  private eof = false;

  constructor(
    private readonly url: string,
    private readonly fetchImpl: typeof fetch,
    private readonly chunkSize: number,
  ) {}

  private async ensure(end: number): Promise<void> {
    if (end > HTTP_TOTAL_MAX) {
      throw new Error(`gguf header read past ${HTTP_TOTAL_MAX} byte budget`);
    }
    while (this.bytes.byteLength < end && !this.eof) {
      const from = this.bytes.byteLength;
      const to = from + this.chunkSize - 1;
      const res = await this.fetchImpl(this.url, {
        headers: {Range: `bytes=${from}-${to}`},
      });
      if (!res.ok) {
        throw new Error(`gguf range request failed: HTTP ${res.status}`);
      }
      const chunk = new Uint8Array(await res.arrayBuffer());
      if (chunk.byteLength === 0) {
        this.eof = true;
        break;
      }
      const grown = new Uint8Array(this.bytes.byteLength + chunk.byteLength);
      grown.set(this.bytes);
      grown.set(chunk, this.bytes.byteLength);
      this.bytes = grown;
      this.view = new DataView(grown.buffer);
      if (chunk.byteLength < this.chunkSize) {
        this.eof = true;
      }
    }
    if (this.bytes.byteLength < end) {
      throw new Error('gguf header truncated');
    }
  }

  async u32(offset: number): Promise<number> {
    await this.ensure(offset + 4);
    return this.view.getUint32(offset, true);
  }

  async u64(offset: number): Promise<number> {
    await this.ensure(offset + 8);
    const value = this.view.getBigUint64(offset, true);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('gguf length exceeds safe integer range');
    }
    return Number(value);
  }

  async i64(offset: number): Promise<number> {
    await this.ensure(offset + 8);
    return Number(this.view.getBigInt64(offset, true));
  }

  async f64(offset: number): Promise<number> {
    await this.ensure(offset + 8);
    return this.view.getFloat64(offset, true);
  }

  async f32(offset: number): Promise<number> {
    await this.ensure(offset + 4);
    return this.view.getFloat32(offset, true);
  }

  async slice(offset: number, length: number): Promise<Uint8Array> {
    await this.ensure(offset + length);
    return this.bytes.subarray(offset, offset + length);
  }

  /** Advancing past bytes still fetches them (sequential prefix), enforcing the budget. */
  async skip(offset: number, length: number): Promise<number> {
    await this.ensure(offset + length);
    return offset + length;
  }
}

/** Strict-enough UTF-8 for GGUF keys and tensor names (short, ASCII-dominated). */
const decodeUtf8 = (bytes: Uint8Array): string => {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i];
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
      i += 1;
    } else if (b0 < 0xe0) {
      out += String.fromCharCode(((b0 & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
      i += 2;
    } else if (b0 < 0xf0) {
      out += String.fromCharCode(
        ((b0 & 0x0f) << 12) |
          ((bytes[i + 1] & 0x3f) << 6) |
          (bytes[i + 2] & 0x3f),
      );
      i += 3;
    } else {
      const cp =
        ((b0 & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f);
      out += String.fromCodePoint(cp);
      i += 4;
    }
  }
  return out;
};

const NEXTN_KV_SUFFIX = '.nextn_predict_layers';
const NEXTN_TENSOR = /(^|\.)nextn\./;

export const readGGUFHeaderForMTP = async (
  url: string,
  options?: ReadGGUFHeaderOptions,
): Promise<GGUFHeaderProbeResult> => {
  const reader = new ChunkedReader(
    url,
    options?.fetchImpl ?? fetch,
    options?.chunkSize ?? HTTP_CHUNK_SIZE,
  );

  if ((await reader.u32(0)) !== GGUF_MAGIC) {
    throw new Error('not a GGUF file (bad magic)');
  }
  const version = await reader.u32(4);
  if (version < 1 || version > 3) {
    throw new Error(`unsupported gguf version ${version}`);
  }
  // v1 uses 32-bit counts and lengths; v2/v3 use 64-bit.
  const len = async (offset: number): Promise<[number, number]> =>
    version === 1
      ? [await reader.u32(offset), offset + 4]
      : [await reader.u64(offset), offset + 8];

  let offset = 8;
  let tensorCount: number;
  let kvCount: number;
  [tensorCount, offset] = await len(offset);
  [kvCount, offset] = await len(offset);
  if (kvCount > MAX_KV_COUNT || tensorCount > MAX_TENSOR_COUNT) {
    throw new Error('gguf header counts out of range');
  }

  const readNumber = async (
    type: number,
    at: number,
  ): Promise<[number, number]> => {
    switch (type) {
      case GGUFType.UINT8:
        return [(await reader.slice(at, 1))[0], at + 1];
      case GGUFType.INT8:
        return [((await reader.slice(at, 1))[0] << 24) >> 24, at + 1];
      case GGUFType.BOOL:
        return [(await reader.slice(at, 1))[0] ? 1 : 0, at + 1];
      case GGUFType.UINT16:
      case GGUFType.INT16: {
        const raw = await reader.u32(at);
        const val = raw & 0xffff;
        return [type === GGUFType.INT16 ? (val << 16) >> 16 : val, at + 2];
      }
      case GGUFType.UINT32:
        return [await reader.u32(at), at + 4];
      case GGUFType.INT32: {
        const raw = await reader.u32(at);
        return [raw | 0, at + 4];
      }
      case GGUFType.FLOAT32:
        return [await reader.f32(at), at + 4];
      case GGUFType.UINT64:
        return [await reader.u64(at), at + 8];
      case GGUFType.INT64:
        return [await reader.i64(at), at + 8];
      case GGUFType.FLOAT64:
        return [await reader.f64(at), at + 8];
      default:
        throw new Error(`gguf value type ${type} is not numeric`);
    }
  };

  const skipValue = async (
    type: number,
    at: number,
    depth: number,
  ): Promise<number> => {
    const fixed = FIXED_SIZES[type];
    if (fixed !== undefined) {
      return reader.skip(at, fixed);
    }
    if (type === GGUFType.STRING) {
      const [strLen, next] = await len(at);
      return reader.skip(next, strLen);
    }
    if (type === GGUFType.ARRAY) {
      if (depth >= MAX_ARRAY_DEPTH) {
        throw new Error('gguf array nesting too deep');
      }
      const elemType = await reader.u32(at);
      let [count, next] = await len(at + 4);
      if (count > MAX_ARRAY_COUNT) {
        throw new Error('gguf array count out of range');
      }
      const elemFixed = FIXED_SIZES[elemType];
      if (elemFixed !== undefined) {
        return reader.skip(next, count * elemFixed);
      }
      // Element-by-element only for strings / nested arrays: integer reads,
      // nothing decoded — this is the tokenizer-vocab walk.
      for (let i = 0; i < count; i++) {
        next = await skipValue(elemType, next, depth + 1);
      }
      return next;
    }
    throw new Error(`unknown gguf value type ${type}`);
  };

  let nextnPredictLayers = 0;
  for (let i = 0; i < kvCount; i++) {
    const [keyLen, afterLen] = await len(offset);
    if (keyLen > MAX_KEY_LENGTH) {
      throw new Error('gguf key length out of range');
    }
    const key = decodeUtf8(await reader.slice(afterLen, keyLen));
    const typeAt = afterLen + keyLen;
    const valueType = await reader.u32(typeAt);
    const valueAt = typeAt + 4;

    if (key.endsWith(NEXTN_KV_SUFFIX) && valueType !== GGUFType.ARRAY) {
      const [value, next] = await readNumber(valueType, valueAt);
      if (Number.isFinite(value) && value > 0) {
        return {nextnPredictLayers: value, hasNextnTensor: false};
      }
      nextnPredictLayers = 0;
      offset = next;
    } else {
      offset = await skipValue(valueType, valueAt, 0);
    }
  }

  // KV said nothing; fall back to tensor names (some converters write the
  // layers without the KV). Stop at the first match.
  for (let i = 0; i < tensorCount; i++) {
    const [nameLen, afterLen] = await len(offset);
    if (nameLen > MAX_KEY_LENGTH) {
      throw new Error('gguf tensor name length out of range');
    }
    const name = decodeUtf8(await reader.slice(afterLen, nameLen));
    if (NEXTN_TENSOR.test(name)) {
      return {nextnPredictLayers, hasNextnTensor: true};
    }
    let at = afterLen + nameLen;
    const nDims = await reader.u32(at);
    if (nDims > 8) {
      throw new Error('gguf tensor rank out of range');
    }
    at += 4;
    at = await reader.skip(at, nDims * (version === 1 ? 4 : 8));
    at = await reader.skip(at, 4); // dtype
    at = await reader.skip(at, 8); // data offset
    offset = at;
  }

  return {nextnPredictLayers, hasNextnTensor: false};
};

export interface GGUFTensorDescriptor {
  type: number;
  dims: number[];
}

export interface GGUFEmbeddingTensors {
  tokenEmbd?: GGUFTensorDescriptor;
  hasOutput: boolean;
}

/** What `loadLlamaModelInfo` reports about a file's layout. */
export interface GGUFLayout {
  version: number;
  alignment: number;
  dataOffset: number;
}

const LOCAL_PREFIX_BYTES = 24; // magic, version, tensor count, KV count
const MAX_LOCAL_DATA_OFFSET = 64 * 1024 * 1024;
const MAX_LOCAL_TENSORS = 2048;
const MAX_LOCAL_ALIGNMENT = 4096;
// gguf.cpp rejects names of GGML_MAX_NAME (64) bytes or more and more than
// GGML_MAX_DIMS (4) dims.
const MAX_TENSOR_NAME = 63;
const MAX_TENSOR_DIMS = 4;
// name length, name, n_dims, dims, type, data offset
const MAX_TENSOR_INFO_BYTES =
  8 + MAX_TENSOR_NAME + 4 + 8 * MAX_TENSOR_DIMS + 12;

const TOKEN_EMBD = Array.from('token_embd.weight', c => c.charCodeAt(0));
const OUTPUT = Array.from('output.weight', c => c.charCodeAt(0));

const isPowerOfTwo = (value: number): boolean => {
  let rest = value;
  while (rest > 1 && rest % 2 === 0) {
    rest /= 2;
  }
  return rest === 1;
};

const readLocalBytes = async (
  path: string,
  length: number,
  position: number,
): Promise<Uint8Array> => {
  const bytes = toByteArray(await RNFS.read(path, length, position, 'base64'));
  if (bytes.length !== length) {
    throw new Error('gguf local read returned fewer bytes than requested');
  }
  return bytes;
};

interface TensorInfoEntry {
  start: number;
  offset: number;
  nDims: number;
  nameAt: number;
  nameLength: number;
}

/**
 * Parses the tensor-info section backwards from its end, the last byte of
 * `bytes`, which lies within `alignment` bytes of the data. Exactly one
 * candidate end must have `tensorCount` entries behind it, offsets falling
 * going back, the last of them at data offset 0. Each position is parsed once
 * and its chain facts cached, so the work is linear in the window.
 */
const parseTensorInfoTail = (
  bytes: Uint8Array,
  tensorCount: number,
  alignment: number,
): GGUFEmbeddingTensors => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u64 = (at: number) =>
    view.getUint32(at + 4, true) * 2 ** 32 + view.getUint32(at, true);
  const isName = (at: number, name: number[]) =>
    name.every((code, i) => bytes[at + i] === code);

  const parseEntryEndingAt = (end: number): TensorInfoEntry | null => {
    if (end - 12 < 0) {
      return null;
    }
    const offset = u64(end - 8);
    if (offset % alignment !== 0) {
      return null;
    }
    let entry: TensorInfoEntry | null = null;
    let matches = 0;
    for (let nDims = 0; nDims <= MAX_TENSOR_DIMS && matches < 2; nDims++) {
      const nDimsAt = end - 16 - 8 * nDims;
      if (nDimsAt < 0 || view.getUint32(nDimsAt, true) !== nDims) {
        continue;
      }
      for (let nameLength = 1; nameLength <= MAX_TENSOR_NAME; nameLength++) {
        const nameAt = nDimsAt - nameLength;
        if (nameAt < 8 || bytes[nameAt] < 0x21 || bytes[nameAt] > 0x7e) {
          break;
        }
        if (
          view.getUint32(nameAt - 4, true) === 0 &&
          view.getUint32(nameAt - 8, true) === nameLength
        ) {
          entry = {start: nameAt - 8, offset, nDims, nameAt, nameLength};
          matches++;
        }
      }
    }
    return matches === 1 ? entry : null;
  };

  const entries = new Map<number, TensorInfoEntry | null>();
  const entryEndingAt = (end: number): TensorInfoEntry | null => {
    let entry = entries.get(end);
    if (entry === undefined) {
      entry = parseEntryEndingAt(end);
      entries.set(end, entry);
    }
    return entry;
  };

  // From an end, walking back: how many entries chain with non-increasing
  // offsets, and the depth of the first one at offset 0 (0 for none).
  const chainLength = new Map<number, number>();
  const zeroDepth = new Map<number, number>();
  const chainFrom = (end: number) => {
    const unresolved: number[] = [];
    let at = end;
    while (!chainLength.has(at)) {
      const entry = entryEndingAt(at);
      if (!entry) {
        chainLength.set(at, 0);
        zeroDepth.set(at, 0);
        break;
      }
      unresolved.push(at);
      at = entry.start;
    }
    for (let i = unresolved.length - 1; i >= 0; i--) {
      const entry = entryEndingAt(unresolved[i])!;
      const previous = entryEndingAt(entry.start);
      const chained = previous !== null && previous.offset <= entry.offset;
      const previousZero = chained ? zeroDepth.get(entry.start)! : 0;
      chainLength.set(
        unresolved[i],
        1 + (chained ? chainLength.get(entry.start)! : 0),
      );
      zeroDepth.set(
        unresolved[i],
        entry.offset === 0 ? 1 : previousZero > 0 ? previousZero + 1 : 0,
      );
    }
    return {length: chainLength.get(end)!, zero: zeroDepth.get(end)!};
  };

  let sectionEnd = -1;
  for (let end = bytes.length; end > bytes.length - alignment; end--) {
    const {length, zero} = chainFrom(end);
    if (zero > 0 && zero <= tensorCount && tensorCount <= length) {
      if (sectionEnd >= 0) {
        throw new Error('gguf tensor info: more than one consistent end');
      }
      sectionEnd = end;
    }
  }
  if (sectionEnd < 0) {
    throw new Error('gguf tensor info: no consistent end');
  }

  const result: GGUFEmbeddingTensors = {hasOutput: false};
  let at = sectionEnd;
  for (let i = 0; i < tensorCount; i++) {
    const {start, nDims, nameAt, nameLength} = entryEndingAt(at)!;
    if (nameLength === TOKEN_EMBD.length && isName(nameAt, TOKEN_EMBD)) {
      const dims: number[] = [];
      for (let d = 0; d < nDims; d++) {
        dims.push(u64(nameAt + nameLength + 4 + 8 * d));
      }
      result.tokenEmbd = {type: view.getUint32(at - 12, true), dims};
    } else if (nameLength === OUTPUT.length && isName(nameAt, OUTPUT)) {
      result.hasOutput = true;
    }
    at = start;
  }
  return result;
};

/**
 * `token_embd.weight`'s descriptor and whether `output.weight` exists, from
 * the tensor-info section of a local GGUF, read back from `dataOffset`. Two
 * reads: the 24-byte prefix, and at most `tensorCount` maximal entries plus
 * `alignment` bytes of padding below the data. Any anomaly throws.
 */
export const readLocalGGUFEmbeddingTensors = async (
  path: string,
  {version, alignment, dataOffset}: GGUFLayout,
): Promise<GGUFEmbeddingTensors> => {
  if (version !== 2 && version !== 3) {
    throw new Error(`gguf version ${version} out of range`);
  }
  if (
    !Number.isInteger(alignment) ||
    alignment > MAX_LOCAL_ALIGNMENT ||
    !isPowerOfTwo(alignment)
  ) {
    throw new Error(`gguf alignment ${alignment} out of range`);
  }
  if (
    !Number.isInteger(dataOffset) ||
    dataOffset < LOCAL_PREFIX_BYTES ||
    dataOffset > MAX_LOCAL_DATA_OFFSET
  ) {
    throw new Error(`gguf data offset ${dataOffset} out of range`);
  }

  const prefixBytes = await readLocalBytes(path, LOCAL_PREFIX_BYTES, 0);
  const prefix = new DataView(
    prefixBytes.buffer,
    prefixBytes.byteOffset,
    prefixBytes.byteLength,
  );
  if (
    prefix.getUint32(0, true) !== GGUF_MAGIC ||
    prefix.getUint32(4, true) !== version
  ) {
    throw new Error('gguf prefix does not match the reported layout');
  }
  const tensorCount = prefix.getUint32(8, true);
  if (
    prefix.getUint32(12, true) !== 0 ||
    tensorCount < 1 ||
    tensorCount > MAX_LOCAL_TENSORS
  ) {
    throw new Error('gguf tensor count out of range');
  }

  const windowLength = Math.min(
    dataOffset - LOCAL_PREFIX_BYTES,
    tensorCount * MAX_TENSOR_INFO_BYTES + alignment,
  );
  const tail = await readLocalBytes(
    path,
    windowLength,
    dataOffset - windowLength,
  );
  return parseTensorInfoTail(tail, tensorCount, alignment);
};
