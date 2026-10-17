const BREAK_TAG = /<br[ \t]*\/?>/gi;
const CONTAINER_PREFIX = /^[ \t>]*/;
const OPENING_FENCE = /^(`{3,}|~{3,})/;
const CLOSING_FENCE = /^(`{3,}|~{3,})\s*$/;

interface Fence {
  marker: string;
  length: number;
}

const readFence = (line: string, pattern: RegExp): Fence | undefined => {
  const match = line.replace(CONTAINER_PREFIX, '').match(pattern);
  return match ? {marker: match[1][0], length: match[1].length} : undefined;
};

const closesFence = (line: string, fence: Fence): boolean => {
  const closing = readFence(line, CLOSING_FENCE);
  return (
    closing !== undefined &&
    closing.marker === fence.marker &&
    closing.length >= fence.length
  );
};

const endOfBacktickRun = (line: string, start: number): number => {
  let end = start;
  while (line[end] === '`') {
    end++;
  }
  return end;
};

const findClosingRun = (line: string, from: number, length: number) => {
  let i = from;
  while (i < line.length) {
    if (line[i] !== '`') {
      i++;
      continue;
    }
    const runEnd = endOfBacktickRun(line, i);
    if (runEnd - i === length) {
      return runEnd;
    }
    i = runEnd;
  }
  return -1;
};

const replaceOutsideCodeSpans = (line: string): string => {
  let result = '';
  let textStart = 0;
  let i = 0;
  while (i < line.length) {
    if (line[i] === '\\') {
      i += 2;
      continue;
    }
    if (line[i] !== '`') {
      i++;
      continue;
    }
    const runEnd = endOfBacktickRun(line, i);
    const spanEnd = findClosingRun(line, runEnd, runEnd - i);
    if (spanEnd === -1) {
      i = runEnd;
      continue;
    }
    result +=
      line.slice(textStart, i).replace(BREAK_TAG, ' ') + line.slice(i, spanEnd);
    textStart = i = spanEnd;
  }
  return result + line.slice(textStart).replace(BREAK_TAG, ' ');
};

/**
 * Turns each `<br>` tag outside code into one space. The renderer draws inline
 * HTML literally, and a GFM table cell cannot hold a line break.
 */
export const normalizeBreakTags = (text: string): string => {
  if (!/<br/i.test(text)) {
    return text;
  }
  let fence: Fence | undefined;
  return text
    .split('\n')
    .map(line => {
      if (fence) {
        if (closesFence(line, fence)) {
          fence = undefined;
        }
        return line;
      }
      fence = readFence(line, OPENING_FENCE);
      return fence ? line : replaceOutsideCodeSpans(line);
    })
    .join('\n');
};
