/**
 * Minimal LaTeX segmentation for chat messages.
 *
 * Splits a markdown message into `text` chunks (rendered with the existing
 * markdown pipeline) and `math` chunks (rendered with KaTeX). Pure functions
 * with no UI dependencies so they are cheap to unit test.
 *
 * Supported delimiters:
 * - `$$...$$`  block math (displayMode)
 * - `\[...\]`  block math (displayMode)
 * - `\(...\)`  inline math
 * - `$...$`    inline math, with guards: the opener needs a non-space
 *   after it and a non-digit before it; the closer needs a non-space
 *   before it and a non-digit after it; content must be non-blank and
 *   free of unescaped `$`. So `$5 and $10` stays text while
 *   `$2 \times 2$` renders.
 *
 * Math inside fenced code blocks (``` / ~~~), inline code (`...`), and
 * GFM table blocks is never parsed — tables keep their layout and show
 * the raw TeX. Unclosed delimiters are returned as plain text so
 * streaming partial messages cannot crash or mis-render.
 */

export interface LatexSegment {
  type: 'text' | 'math';
  /** For text: markdown chunk. For math: raw TeX source (trimmed). */
  content: string;
  /** Only meaningful for math segments. */
  displayMode: boolean;
  /** Original slice, used for fallback rendering / copy. */
  raw: string;
}

/**
 * Memory/perf guard: each rendered formula mounts one WebView. Reasoning
 * blocks intentionally render no math, so the budget belongs to the actual
 * response. 20 covers long math answers (models rarely emit more); these
 * are tiny static KaTeX documents — far lighter than the interactive HTML
 * previews the docs' 5-WebView caution targets — and the app already
 * requires 6GB+ RAM devices. Beyond the cap, raw TeX falls back to code.
 */
export const MAX_MATH_PER_MESSAGE = 20;

interface Delimiter {
  open: string;
  close: string;
  displayMode: boolean;
}

const DELIMITERS: Delimiter[] = [
  {open: '$$', close: '$$', displayMode: true},
  {open: '\\[', close: '\\]', displayMode: true},
  {open: '\\(', close: '\\)', displayMode: false},
];

/** True when `text[index]` starts an unescaped `$$` (even # of `\` before). */
function isUnescapedDollarDollar(text: string, index: number): boolean {
  if (text[index] !== '$' || text[index + 1] !== '$') {
    return false;
  }
  let slashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) {
    slashes++;
  }
  return slashes % 2 === 0;
}

function findUnescapedDollarDollar(text: string, from: number): number {
  let i = text.indexOf('$$', from);
  while (i !== -1) {
    if (isUnescapedDollarDollar(text, i)) {
      return i;
    }
    i = text.indexOf('$$', i + 2);
  }
  return -1;
}

interface Fence {
  index: number;
  end: number;
  raw: string;
}

/**
 * Find the next fenced code block (``` or ~~~) from `from`. An unclosed
 * fence runs to end of input (streaming safety).
 */
function findNextFence(text: string, from: number): Fence | undefined {
  const fenceRe = /(^|\n)(`{3,}|~{3,})([^\n]*)\n?/g;
  fenceRe.lastIndex = from;
  const match = fenceRe.exec(text);
  if (!match) {
    return undefined;
  }
  const index = match.index + (match[1] ? match[1].length : 0);
  const marker = match[2];
  const contentStart = fenceRe.lastIndex;
  const closingRe = new RegExp(`(^|\\n)${marker}[ \\t]*(?=\\n|$)`, 'g');
  closingRe.lastIndex = contentStart;
  const close = closingRe.exec(text);
  if (!close) {
    return {index, end: text.length, raw: text.slice(index)};
  }
  const closingIndex = close.index + (close[1] ? close[1].length : 0);
  return {
    index,
    end: closingIndex + marker.length,
    raw: text.slice(index, closingIndex + marker.length),
  };
}

interface MathMatch {
  index: number;
  end: number;
  raw: string;
  content: string;
  displayMode: boolean;
}

const isDigitChar = (ch: string | undefined): boolean =>
  ch !== undefined && ch >= '0' && ch <= '9';

/**
 * True for a `$` that may open/close inline math: not part of `$$` (those
 * belong to the block delimiter) and not escaped with `\`.
 */
function isBareDollar(text: string, index: number): boolean {
  if (text[index] !== '$') {
    return false;
  }
  if (text[index - 1] === '$' || text[index + 1] === '$') {
    return false;
  }
  let slashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) {
    slashes++;
  }
  return slashes % 2 === 0;
}

function findBareDollar(text: string, from: number): number {
  let i = text.indexOf('$', from);
  while (i !== -1) {
    if (isBareDollar(text, i)) {
      return i;
    }
    i = text.indexOf('$', i + 1);
  }
  return -1;
}

/**
 * True when content holds an unescaped `$` (single or as `$$`). Used to
 * reject spans like `$5 and $x$` as one match so the tail can still parse
 * as `$x$`, and to stop single-`$` from ever swallowing `$$` blocks.
 * Escaped `\$` (a literal dollar in TeX) is allowed.
 */
function contentHasRawDollar(content: string): boolean {
  for (let i = 0; i < content.length; i++) {
    if (content[i] !== '$') {
      continue;
    }
    let slashes = 0;
    for (let j = i - 1; j >= 0 && content[j] === '\\'; j--) {
      slashes++;
    }
    if (slashes % 2 === 0) {
      return true;
    }
  }
  return false;
}

/**
 * Earliest valid single-`$` inline match at/after `from`, or undefined.
 * See the file docblock for the guard rules. Unclosed/escaped/empty and
 * currency shapes all yield undefined (plain text, streaming-safe).
 */
function findSingleDollarMath(
  text: string,
  from: number,
): MathMatch | undefined {
  let open = from;
  while (true) {
    open = findBareDollar(text, open);
    if (open === -1) {
      return undefined;
    }
    const afterOpen = text[open + 1];
    const beforeOpen = open > 0 ? text[open - 1] : '';
    if (
      afterOpen === undefined ||
      /\s/.test(afterOpen) ||
      isDigitChar(beforeOpen)
    ) {
      open += 1;
      continue;
    }
    let close = open + 1;
    let exhausted = true;
    while (true) {
      close = findBareDollar(text, close);
      if (close === -1) {
        break;
      }
      const beforeClose = text[close - 1];
      const afterClose = text[close + 1];
      if (
        beforeClose === undefined ||
        /\s/.test(beforeClose) ||
        isDigitChar(afterClose)
      ) {
        close += 1;
        continue;
      }
      const content = text.slice(open + 1, close);
      if (content.trim() === '') {
        close += 1;
        continue;
      }
      if (contentHasRawDollar(content)) {
        // Reject this opener but keep scanning: a valid pair may start
        // later (e.g. `$5 and $x$` still yields `$x$`).
        exhausted = false;
        break;
      }
      return {
        index: open,
        end: close + 1,
        raw: text.slice(open, close + 1),
        content: content.trim(),
        displayMode: false,
      };
    }
    if (exhausted) {
      // No `$` left after this opener, so no later opener can match either
      // (closer validity never depends on the opener).
      return undefined;
    }
    open += 1;
  }
}

const SINGLE_DOLLAR: Delimiter = {open: '$', close: '$', displayMode: false};

/** Find the earliest math delimiter at/after `from` (code already excluded). */
function findNextMath(text: string, from: number): MathMatch | undefined {
  type Candidate = {index: number; d: Delimiter; single?: MathMatch};
  const candidates: Candidate[] = [];

  const dollar = findUnescapedDollarDollar(text, from);
  if (dollar !== -1) {
    candidates.push({index: dollar, d: DELIMITERS[0]});
  }
  const bracket = text.indexOf('\\[', from);
  if (bracket !== -1) {
    candidates.push({index: bracket, d: DELIMITERS[1]});
  }
  const paren = text.indexOf('\\(', from);
  if (paren !== -1) {
    candidates.push({index: paren, d: DELIMITERS[2]});
  }
  const single = findSingleDollarMath(text, from);
  if (single) {
    // Pushed last so `$$` wins index ties (stable sort); single-`$` can
    // never share an index with `$$` anyway (bare check skips those).
    candidates.push({index: single.index, d: SINGLE_DOLLAR, single});
  }
  if (candidates.length === 0) {
    return undefined;
  }
  candidates.sort((a, b) => a.index - b.index);

  for (const {index, d, single: singleMatch} of candidates) {
    if (singleMatch) {
      return singleMatch;
    }
    const contentStart = index + d.open.length;
    let close: number;
    if (d.open === '$$') {
      close = findUnescapedDollarDollar(text, contentStart);
    } else {
      close = text.indexOf(d.close, contentStart);
    }
    if (close === -1) {
      // Unclosed (e.g. still streaming) — try a later opener, else text.
      continue;
    }
    const content = text.slice(contentStart, close);
    if (content.trim() === '') {
      continue;
    }
    return {
      index,
      end: close + d.close.length,
      raw: text.slice(index, close + d.close.length),
      content: content.trim(),
      displayMode: d.displayMode,
    };
  }
  return undefined;
}

const TABLE_DELIMITER_ROW_RE =
  /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;

export interface TableRange {
  start: number;
  end: number;
}

/**
 * Char ranges of GFM table blocks (header + delimiter + data rows) in the
 * original input. Math inside these ranges is left raw so tables survive —
 * splitting a row around a formula would destroy the table for every reader.
 * Same `|`-in-header rule as the markdown table renderer. Exported so the
 * renderer can keep table paragraphs on the native path.
 */
export function findTableRanges(text: string): TableRange[] {
  const ranges: TableRange[] = [];
  const lines: Array<{start: number; end: number; text: string}> = [];
  let offset = 0;
  for (const line of text.split('\n')) {
    lines.push({start: offset, end: offset + line.length, text: line});
    offset += line.length + 1; // +1 for the stripped \n
  }
  for (let i = 0; i < lines.length; i++) {
    if (
      !lines[i].text.includes('|') ||
      i + 1 >= lines.length ||
      !TABLE_DELIMITER_ROW_RE.test(lines[i + 1].text)
    ) {
      continue;
    }
    let j = i + 2;
    while (j < lines.length && lines[j].text.includes('|')) {
      j++;
    }
    ranges.push({start: lines[i].start, end: lines[j - 1].end});
    i = j - 1;
  }
  return ranges;
}

function isInRanges(ranges: TableRange[], index: number): boolean {
  return ranges.some(r => index >= r.start && index < r.end);
}

/**
 * Split a non-fence chunk by inline code (`...`). Returns spans marked as
 * code (verbatim) or normal (math-parseable), with absolute `start` offsets
 * into the original input. Only single-backtick runs are handled; unclosed
 * backtick runs to end of input.
 */
function splitInlineCode(
  chunk: string,
  baseOffset: number,
): Array<{text: string; isCode: boolean; start: number}> {
  const spans: Array<{text: string; isCode: boolean; start: number}> = [];
  let i = 0;
  while (i < chunk.length) {
    const open = chunk.indexOf('`', i);
    if (open === -1) {
      spans.push({text: chunk.slice(i), isCode: false, start: baseOffset + i});
      break;
    }
    if (open > i) {
      spans.push({
        text: chunk.slice(i, open),
        isCode: false,
        start: baseOffset + i,
      });
    }
    const close = chunk.indexOf('`', open + 1);
    if (close === -1) {
      spans.push({
        text: chunk.slice(open),
        isCode: true,
        start: baseOffset + open,
      });
      break;
    }
    spans.push({
      text: chunk.slice(open, close + 1),
      isCode: true,
      start: baseOffset + open,
    });
    i = close + 1;
  }
  return spans;
}

function pushText(segments: LatexSegment[], text: string): void {
  if (text) {
    segments.push({type: 'text', content: text, displayMode: false, raw: text});
  }
}

/**
 * Split normal (non-code) text into text/math segments. `baseOffset` maps
 * chunk-relative indexes to the original input for the table guard.
 */
function splitNormalText(
  text: string,
  baseOffset: number,
  tableRanges: TableRange[],
  segments: LatexSegment[],
): void {
  let i = 0;
  while (i < text.length) {
    const m = findNextMath(text, i);
    if (!m) {
      pushText(segments, text.slice(i));
      break;
    }
    if (isInRanges(tableRanges, baseOffset + m.index)) {
      // Inside a table row: keep the raw verbatim so the table survives.
      pushText(segments, text.slice(i, m.end));
      i = m.end;
      continue;
    }
    pushText(segments, text.slice(i, m.index));
    segments.push({
      type: 'math',
      content: m.content,
      displayMode: m.displayMode,
      raw: m.raw,
    });
    i = m.end;
  }
}

/**
 * Fallback markdown for math that must stay visible without a WebView
 * (over the per-message cap). Code formatting keeps the TeX literal through
 * the markdown pipeline. Backticks are stripped — TeX never needs them.
 */
export function mathFallbackMarkdown(
  displayMode: boolean,
  raw: string,
): string {
  const safe = raw.replace(/`/g, '');
  return displayMode ? '```tex\n' + safe + '\n```' : '`' + safe + '`';
}

/**
 * Split a markdown message into text/math segments. Code (fenced + inline)
 * and table blocks are always preserved verbatim as text. Never throws; on
 * any unexpected input returns the whole message as a single text segment.
 */
export function splitTextWithMath(input: string): LatexSegment[] {
  try {
    if (!input) {
      return [];
    }
    const tableRanges = findTableRanges(input);
    const segments: LatexSegment[] = [];
    const splitChunk = (chunk: string, baseOffset: number): void => {
      for (const span of splitInlineCode(chunk, baseOffset)) {
        if (span.isCode) {
          pushText(segments, span.text);
        } else {
          splitNormalText(span.text, span.start, tableRanges, segments);
        }
      }
    };
    let i = 0;
    while (i < input.length) {
      const fence = findNextFence(input, i);
      if (!fence) {
        // No more fences: handle inline code + math for the remainder.
        splitChunk(input.slice(i), i);
        break;
      }
      // Text before the fence.
      if (fence.index > i) {
        splitChunk(input.slice(i, fence.index), i);
      }
      // The fence itself is verbatim text.
      pushText(segments, fence.raw);
      i = fence.end;
    }
    return segments;
  } catch {
    return [{type: 'text', content: input, displayMode: false, raw: input}];
  }
}
