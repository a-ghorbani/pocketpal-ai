import {normalizeBreakTags} from './normalizeBreakTags';

const FENCE = /^\s*(```|~~~)/;
const BACKTICK_RUN = /`+/g;
const LINK_OR_IMAGE = /!?\[([^[\]\n]*)]\([^()\s]*\)/g;
const PAIRED_MARKERS: [RegExp, string][] = [
  [/\*\*(?=\S)([^*\n]*[^*\s])\*\*/g, '$1'],
  [/__(?=\S)([^_\n]*[^_\s])__/g, '$1'],
  [/~~(?=\S)([^~\n]*[^~\s])~~/g, '$1'],
  [/(^|[^\w*])\*(?=[^\s*])([^*\n]*[^*\s])\*(?![\w*])/g, '$1$2'],
  [/(^|[^\w_])_(?=[^\s_])([^_\n]*[^_\s])_(?![\w_])/g, '$1$2'],
];

const stripBlockMarkers = (line: string): string =>
  line
    .replace(/^\s{0,3}(>\s?)+/, '')
    .replace(/^\s{0,3}#{1,6}\s+/, '')
    .replace(/^\s*([-*+]|\d+[.)])\s+(\[[ xX]]\s+)?/, '');

const stripInlineMarkers = (text: string): string =>
  PAIRED_MARKERS.reduce(
    (out, [pattern, replacement]) => out.replace(pattern, replacement),
    text.replace(LINK_OR_IMAGE, '$1'),
  );

/** Code spans keep their content verbatim; a run without a closer stays text. */
const inlineToPlain = (line: string): string => {
  const runs = [...line.matchAll(BACKTICK_RUN)].map(match => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
  const closer: number[] = [];
  const lastOfLength = new Map<number, number>();
  for (let i = runs.length - 1; i >= 0; i--) {
    const length = runs[i].end - runs[i].start;
    closer[i] = lastOfLength.get(length) ?? -1;
    lastOfLength.set(length, i);
  }

  let plain = '';
  let cursor = 0;
  for (let i = 0; i < runs.length; i++) {
    if (closer[i] === -1) {
      continue;
    }
    const close = runs[closer[i]];
    plain +=
      stripInlineMarkers(line.slice(cursor, runs[i].start)) +
      line.slice(runs[i].end, close.start);
    cursor = close.end;
    i = closer[i];
  }
  return plain + stripInlineMarkers(line.slice(cursor));
};

/** Rendered-looking text of a markdown message, for a screen-reader label. */
export const markdownToPlainText = (markdown: string): string => {
  let inFence = false;
  return normalizeBreakTags(markdown)
    .split('\n')
    .map(line => {
      if (FENCE.test(line)) {
        inFence = !inFence;
        return '';
      }
      return inFence ? line : inlineToPlain(stripBlockMarkers(line));
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
};
