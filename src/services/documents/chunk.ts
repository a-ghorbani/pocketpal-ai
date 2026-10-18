import {CHARS_PER_TOKEN, DENSE_SCRIPT, estimateDocTokens} from './estimate';
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
    if (dense + Math.ceil(other / CHARS_PER_TOKEN) > limit) {
      break;
    }
    end += char.length;
  }
  return end;
};

const matchEnds = (text: string, pattern: RegExp): number[] =>
  [...text.matchAll(pattern)].map(
    match => (match.index ?? 0) + match[0].length,
  );

/** Pieces shorter than this are headings or stray tails; they ride with a neighbour. */
const MIN_PASSAGE_TOKENS = PASSAGE_MAX_TOKENS / 4;

const BREAKS = [/\n\s*\n/g, /[.!?。！？](?=\s)|[。！？]/g, /\s+/g];

const cutPoint = (text: string): number => {
  const prefix = text.slice(0, fittingPrefix(text, PASSAGE_MAX_TOKENS));
  const substantial = (part: string) =>
    estimateDocTokens(part.trim()) >= MIN_PASSAGE_TOKENS;
  for (const pattern of BREAKS) {
    const ends = matchEnds(prefix, pattern).filter(end => end > 0);
    const balanced = ends.filter(
      end => substantial(text.slice(0, end)) && substantial(text.slice(end)),
    );
    if (balanced.length > 0) {
      return balanced[balanced.length - 1];
    }
  }
  for (const pattern of BREAKS) {
    const ends = matchEnds(prefix, pattern).filter(end => end > 0);
    if (ends.length > 0) {
      return ends[ends.length - 1];
    }
  }
  return Math.max(1, prefix.length);
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
