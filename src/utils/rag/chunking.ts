/**
 * Paragraph-aware chunking for knowledge-base indexing.
 *
 * Chunk boundaries land on paragraph breaks where possible so semantic
 * units stay together. Any single paragraph longer than the hard cap is
 * split by sentence, then by characters, so pathological input (a
 * minified file, base64 blob) still indexes.
 */

export interface TextChunk {
  /** Stable position of the chunk inside the document. */
  index: number;
  text: string;
}

export interface ChunkOptions {
  /** Target chunk length in characters (~400 tokens at 3.4 chars/token). */
  targetChars?: number;
  /** Soft lower bound before merging a tiny chunk into its neighbor. */
  minChars?: number;
  /** Characters of trailing context repeated into the next chunk. */
  overlapChars?: number;
}

export const DEFAULT_CHUNK_CHARS = 1_400;
export const DEFAULT_CHUNK_MIN_CHARS = 200;
export const DEFAULT_CHUNK_OVERLAP_CHARS = 200;

const PARAGRAPH_SPLIT = /\n{2,}/;

export const chunkText = (
  text: string,
  options: ChunkOptions = {},
): TextChunk[] => {
  const targetChars = Math.max(options.targetChars ?? DEFAULT_CHUNK_CHARS, 400);
  const minChars = Math.max(options.minChars ?? DEFAULT_CHUNK_MIN_CHARS, 0);
  const overlapChars = Math.min(
    Math.max(options.overlapChars ?? DEFAULT_CHUNK_OVERLAP_CHARS, 0),
    Math.floor(targetChars / 4),
  );

  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (normalized.length === 0) {
    return [];
  }

  // 1. Split to paragraphs, hard-splitting oversized ones.
  const paragraphs: string[] = [];
  for (const para of normalized.split(PARAGRAPH_SPLIT)) {
    const p = para.trim();
    if (!p) {
      continue;
    }
    if (p.length <= targetChars * 1.5) {
      paragraphs.push(p);
      continue;
    }
    paragraphs.push(...splitLongParagraph(p, targetChars));
  }

  // 2. Greedily pack paragraphs into chunks up to targetChars.
  const chunks: string[] = [];
  let current = '';
  const pushCurrent = () => {
    const trimmed = current.trim();
    if (trimmed) {
      chunks.push(trimmed);
    }
    current = overlapChars > 0 && trimmed ? trimmed.slice(-overlapChars) : '';
  };

  for (const para of paragraphs) {
    // Would adding this paragraph overflow and the chunk is already
    // substantial? Close the chunk first (keeping overlap for context).
    if (
      current.length + para.length + 1 > targetChars &&
      current.length >= minChars
    ) {
      pushCurrent();
    }
    current = current ? `${current}\n${para}` : para;
    while (current.length > targetChars * 1.5) {
      // Pathological single paragraph: split at the target boundary on a
      // word edge when we can, then keep the tail as the new current.
      let cut = current.lastIndexOf(' ', targetChars);
      if (cut < targetChars * 0.5) {
        cut = targetChars;
      }
      chunks.push(current.slice(0, cut).trim());
      const tail = current.slice(cut).trim();
      current =
        overlapChars > 0 && tail
          ? `${chunks[chunks.length - 1].slice(-overlapChars)} ${tail}`
          : tail;
    }
  }
  pushCurrent();

  // 3. Merge a trailing undersized chunk into its predecessor.
  if (
    minChars > 0 &&
    chunks.length >= 2 &&
    chunks[chunks.length - 1].length < minChars
  ) {
    const last = chunks.pop()!;
    chunks[chunks.length - 1] = `${chunks[chunks.length - 1]}\n${last}`;
  }

  return chunks.map((t, index) => ({index, text: t}));
};

/** Split one oversized paragraph on sentence boundaries where possible. */
const splitLongParagraph = (para: string, targetChars: number): string[] => {
  const sentences = para.match(/[^.!?\n]+[.!?]*\s*/g) ?? [para];
  const out: string[] = [];
  let buf = '';
  for (const sentence of sentences) {
    if (buf.length + sentence.length > targetChars && buf) {
      out.push(buf.trim());
      buf = '';
    }
    if (sentence.length > targetChars * 1.5) {
      // Sentence itself too long: character split.
      for (let i = 0; i < sentence.length; i += targetChars) {
        out.push(sentence.slice(i, i + targetChars).trim());
      }
      continue;
    }
    buf += sentence;
  }
  if (buf.trim()) {
    out.push(buf.trim());
  }
  return out;
};
