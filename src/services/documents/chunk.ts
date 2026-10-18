import {CHARS_PER_TOKEN, DENSE_SCRIPT} from './estimate';
import {documentKey} from './render';
import {PASSAGE_MAX_TOKENS, type DocumentRef} from './types';

export interface Passage {
  docId: string;
  rangeKey: string;
  ordinal: number;
  /** PDF page number; absent for a text file. */
  page?: number;
  part: number;
  parts: number;
  text: string;
}

/** Pieces shorter than this are headings or stray tails; they ride with a neighbour. */
const MIN_PASSAGE_TOKENS = PASSAGE_MAX_TOKENS / 4;

const BREAKS = [/\n\s*\n/g, /[.!?。！？](?=\s)|[。！？]/g, /\s+/g];

const isSpace = (code: number) => /\s/.test(String.fromCharCode(code));

const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

/**
 * Token estimates of any slice in O(1): prefix counts of dense and other code
 * points, indexed by UTF-16 offset, so splitting a page is linear in its size.
 */
const tokenCounter = (text: string) => {
  const dense = new Int32Array(text.length + 1);
  const other = new Int32Array(text.length + 1);
  let i = 0;
  for (const char of text) {
    const isDense = DENSE_SCRIPT.test(char) ? 1 : 0;
    for (let unit = 0; unit < char.length; unit++, i++) {
      const counts = unit === 0 ? 1 : 0;
      dense[i + 1] = dense[i] + (counts && isDense);
      other[i + 1] = other[i] + (counts && 1 - isDense);
    }
  }
  const tokens = (from: number, to: number) =>
    dense[to] -
    dense[from] +
    Math.ceil((other[to] - other[from]) / CHARS_PER_TOKEN);
  const trimmedTokens = (from: number, to: number) => {
    while (from < to && isSpace(text.charCodeAt(from))) {
      from++;
    }
    while (to > from && isSpace(text.charCodeAt(to - 1))) {
      to--;
    }
    return tokens(from, to);
  };
  /** Largest end such that [from, end) stays within the limit, on a code point boundary. */
  const fittingEnd = (from: number, limit: number) => {
    let low = from;
    let high = text.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (tokens(from, mid) <= limit) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return low > from && isLowSurrogate(text.charCodeAt(low)) ? low - 1 : low;
  };
  return {tokens, trimmedTokens, fittingEnd};
};

const matchEnds = (text: string, pattern: RegExp): number[] =>
  [...text.matchAll(pattern)].map(
    match => (match.index ?? 0) + match[0].length,
  );

/** Splits one page into passages of at most PASSAGE_MAX_TOKENS estimated tokens. */
export function* pagePieces(page: string): Generator<string> {
  const text = page.trim();
  const {tokens, trimmedTokens, fittingEnd} = tokenCounter(text);
  let start = 0;
  while (start < text.length) {
    if (tokens(start, text.length) <= PASSAGE_MAX_TOKENS) {
      yield text.slice(start);
      return;
    }
    const window = text.slice(start, fittingEnd(start, PASSAGE_MAX_TOKENS));
    const substantial = (from: number, to: number) =>
      trimmedTokens(from, to) >= MIN_PASSAGE_TOKENS;
    let cut: number | undefined;
    for (const pattern of BREAKS) {
      const balanced = matchEnds(window, pattern).filter(
        end =>
          end > 0 &&
          substantial(start, start + end) &&
          substantial(start + end, text.length),
      );
      if (balanced.length > 0) {
        cut = balanced[balanced.length - 1];
        break;
      }
    }
    if (cut === undefined) {
      for (const pattern of BREAKS) {
        const ends = matchEnds(window, pattern).filter(end => end > 0);
        if (ends.length > 0) {
          cut = ends[ends.length - 1];
          break;
        }
      }
    }
    cut = cut ?? Math.max(1, window.length);
    const piece = text.slice(start, start + cut).trim();
    if (piece) {
      yield piece;
    }
    start += cut;
    while (start < text.length && isSpace(text.charCodeAt(start))) {
      start++;
    }
  }
}

export const splitPage = (page: string): string[] => [...pagePieces(page)];

const pageNumberOf = (ref: DocumentRef, index: number) =>
  ref.kind === 'pdf' ? (ref.pageRange?.from ?? 1) + index : undefined;

const yieldToEventLoop = () =>
  new Promise<void>(resolve => setTimeout(resolve, 0));

const PIECES_PER_YIELD = 64;

/** Page-ordered passages; yields between pages and every few passages within one. */
export const chunkDocument = async (
  ref: DocumentRef,
  pages: string[],
): Promise<Passage[]> => {
  const passages: Passage[] = [];
  const rangeKey = documentKey(ref);
  const source = ref.kind === 'pdf' ? pages : [pages.join('\n')];
  for (let i = 0; i < source.length; i++) {
    if (i > 0) {
      await yieldToEventLoop();
    }
    const pieces: string[] = [];
    for (const piece of pagePieces(source[i])) {
      pieces.push(piece);
      if (pieces.length % PIECES_PER_YIELD === 0) {
        await yieldToEventLoop();
      }
    }
    const page = pageNumberOf(ref, i);
    pieces.forEach((text, part) =>
      passages.push({
        docId: ref.id,
        rangeKey,
        ordinal: passages.length,
        page,
        part: part + 1,
        parts: pieces.length,
        text,
      }),
    );
  }
  return passages;
};
