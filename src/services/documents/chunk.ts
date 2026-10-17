import {DENSE_SCRIPT, estimateDocTokens} from './estimate';
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

/** Longest prefix length (in UTF-16 units) whose estimate stays within the limit. */
const fittingPrefix = (text: string, limit: number): number => {
  let dense = 0;
  let other = 0;
  let end = 0;
  for (const char of text) {
    if (DENSE_SCRIPT.test(char)) {
      dense += 1;
    } else {
      other += 1;
    }
    if (dense + Math.ceil(other / 4) > limit) {
      break;
    }
    end += char.length;
  }
  return end;
};

const lastMatchEnd = (text: string, pattern: RegExp): number => {
  let end = -1;
  for (const match of text.matchAll(pattern)) {
    end = (match.index ?? 0) + match[0].length;
  }
  return end;
};

const cutPoint = (text: string): number => {
  const prefix = text.slice(0, fittingPrefix(text, PASSAGE_MAX_TOKENS));
  const candidates = [
    lastMatchEnd(prefix, /\n\s*\n/g),
    lastMatchEnd(prefix, /[.!?。！？](?=\s)|[。！？]/g),
    lastMatchEnd(prefix, /\s+/g),
  ];
  const cut = candidates.find(end => end > 0);
  return cut ?? Math.max(1, prefix.length);
};

/** Splits one page into passages of at most PASSAGE_MAX_TOKENS estimated tokens. */
export const splitPage = (page: string): string[] => {
  const pieces: string[] = [];
  let rest = page.trim();
  while (rest) {
    if (estimateDocTokens(rest) <= PASSAGE_MAX_TOKENS) {
      pieces.push(rest);
      break;
    }
    const cut = cutPoint(rest);
    const piece = rest.slice(0, cut).trim();
    if (piece) {
      pieces.push(piece);
    }
    rest = rest.slice(cut).trim();
  }
  return pieces;
};

const passagesOfPage = (
  ref: DocumentRef,
  page: string,
  pageNumber: number | undefined,
  firstOrdinal: number,
): Passage[] => {
  const pieces = splitPage(page);
  return pieces.map((text, i) => ({
    docId: ref.id,
    rangeKey: documentKey(ref),
    ordinal: firstOrdinal + i,
    page: pageNumber,
    part: i + 1,
    parts: pieces.length,
    text,
  }));
};

const pageNumberOf = (ref: DocumentRef, index: number) =>
  ref.kind === 'pdf' ? (ref.pageRange?.from ?? 1) + index : undefined;

const yieldToEventLoop = () =>
  new Promise<void>(resolve => setTimeout(resolve, 0));

/** Page-ordered passages; yields between pages so a long PDF never blocks the JS thread. */
export const chunkDocument = async (
  ref: DocumentRef,
  pages: string[],
): Promise<Passage[]> => {
  const passages: Passage[] = [];
  const source = ref.kind === 'pdf' ? pages : [pages.join('\n')];
  for (let i = 0; i < source.length; i++) {
    if (i > 0) {
      await yieldToEventLoop();
    }
    passages.push(
      ...passagesOfPage(ref, source[i], pageNumberOf(ref, i), passages.length),
    );
  }
  return passages;
};
