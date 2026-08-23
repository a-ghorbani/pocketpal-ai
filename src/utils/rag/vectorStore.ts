/**
 * Vector math + binary persistence for knowledge-base embeddings.
 *
 * Embeddings are stored L2-normalized so retrieval is a plain dot
 * product. Vectors live in one flat binary file per document
 * (float32 little-endian, concatenated); RNFS's `ascii` encoding maps
 * JS char codes 0-255 to bytes one-to-one, which is the standard
 * React Native trick for binary file I/O without native additions.
 */
import * as RNFS from '@dr.pogodin/react-native-fs';

export const VECTOR_DIR = `${RNFS.DocumentDirectoryPath}/kb-vectors`;

export const l2Normalize = (v: number[] | Float32Array): Float32Array => {
  const out = new Float32Array(v.length);
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i] * v[i];
  }
  const norm = Math.sqrt(sum) || 1;
  for (let i = 0; i < v.length; i++) {
    out[i] = v[i] / norm;
  }
  return out;
};

export const dotProduct = (
  a: number[] | Float32Array,
  b: number[] | Float32Array,
): number => {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += a[i] * b[i];
  }
  return sum;
};

/** Cosine similarity; equals the dot product when inputs are normalized. */
export const cosineSimilarity = (
  a: number[] | Float32Array,
  b: number[] | Float32Array,
): number => {
  const na = l2Normalize(a);
  const nb = l2Normalize(b);
  return dotProduct(na, nb);
};

/** Pack float32 vectors into a binary string RNFS can write as ascii. */
export const vectorsToBinary = (vectors: Float32Array[]): string => {
  let parts = '';
  for (const v of vectors) {
    const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    let s = '';
    for (let i = 0; i < bytes.length; i++) {
      s += String.fromCharCode(bytes[i]);
    }
    parts += s;
  }
  return parts;
};

/** Unpack a binary string back into float32 vectors of dimension `dims`. */
export const binaryToVectors = (
  binary: string,
  dims: number,
): Float32Array[] => {
  const bytesPerVector = dims * 4;
  const count = Math.floor(binary.length / bytesPerVector);
  const out: Float32Array[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = new Uint8Array(bytesPerVector);
    for (let j = 0; j < bytesPerVector; j++) {
      bytes[j] = binary.charCodeAt(i * bytesPerVector + j);
    }
    out.push(new Float32Array(bytes.buffer));
  }
  return out;
};

const vectorPath = (docId: string): string => `${VECTOR_DIR}/${docId}.vec`;

export const writeDocVectors = async (
  docId: string,
  vectors: Float32Array[],
): Promise<void> => {
  await RNFS.mkdir?.(VECTOR_DIR).catch(() => undefined);
  await RNFS.writeFile(vectorPath(docId), vectorsToBinary(vectors), 'ascii');
};

export const readDocVectors = async (
  docId: string,
  dims: number,
): Promise<Float32Array[]> => {
  try {
    const binary = await RNFS.readFile(vectorPath(docId), 'ascii');
    return binaryToVectors(binary, dims);
  } catch {
    return [];
  }
};

export const deleteDocVectors = async (docId: string): Promise<void> => {
  try {
    await RNFS.unlink(vectorPath(docId));
  } catch {
    // Missing file is fine on delete.
  }
};

export const vectorsFileSize = async (docId: string): Promise<number> => {
  try {
    const stat = await RNFS.stat(vectorPath(docId));
    return (stat as {size?: number}).size ?? 0;
  } catch {
    return 0;
  }
};
