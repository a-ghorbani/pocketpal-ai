import {
  MessageParserOptions,
  MessageSegment,
  ParsedAssistantMessage,
} from './types';
import {findServiceToken, hasServiceTokens} from './serviceTokens';
import {containsUnsafeHtml, markdownToPlainText} from './markdown';

const DEFAULT_THINKING_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['<think>', '</think>'],
  ['<thinking>', '</thinking>'],
  ['<thought>', '</thought>'],
  ['<analysis>', '</analysis>'],
] as const;

const TOOL_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['<tool_call>', '</tool_call>'],
  ['<function_call>', '</function_call>'],
] as const;

function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) % 2147483647;
  }
  return Math.abs(hash).toString(36);
}

function normalizeCleanText(text: string): string {
  return text
    .replace(/<final>([\s\S]*?)<\/final>/gi, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function pushTextSegment(segments: MessageSegment[], raw: string) {
  if (!raw) {
    return;
  }

  const content = raw;
  const trimmed = content.trim();
  let kind: MessageSegment['kind'] = 'markdown';

  if (isMarkdownTable(trimmed)) {
    kind = 'table';
  } else if (isLikelyJson(trimmed)) {
    kind = 'json';
  } else if (isLikelyXml(trimmed)) {
    kind = 'xml';
  } else if (!hasMarkdownMarkers(trimmed)) {
    kind = 'text';
  }

  segments.push({
    id: `seg-${segments.length}`,
    kind,
    raw,
    content,
    malformed: kind === 'json' && !tryParseJson(trimmed),
  });
}

function hasMarkdownMarkers(text: string): boolean {
  return /(^|\n)\s*(#{1,6}\s|[-*+]\s+|\d+\.\s+|>\s|---+\s*$)|[*_~`[\]]/.test(
    text,
  );
}

function isMarkdownTable(text: string): boolean {
  const lines = text.split('\n').filter(Boolean);
  if (lines.length < 2) {
    return false;
  }

  return (
    lines[0].includes('|') &&
    /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[1])
  );
}

function isLikelyJson(text: string): boolean {
  return text.startsWith('{') || text.startsWith('[');
}

function isLikelyXml(text: string): boolean {
  return /^<([A-Za-z][\w:-]*)(\s[^>]*)?>[\s\S]*<\/\1>$/.test(text);
}

function tryParseJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function findNextCodeFence(text: string, fromIndex: number) {
  const fenceRe = /(^|\n)(`{3,}|~{3,})([^\n]*)\n?/g;
  fenceRe.lastIndex = fromIndex;
  const match = fenceRe.exec(text);
  if (!match) {
    return undefined;
  }

  const index = match.index + (match[1] ? match[1].length : 0);
  const marker = match[2];
  const language = match[3]?.trim();
  const contentStart = fenceRe.lastIndex;
  const closingRe = new RegExp(`(^|\\n)${marker}[ \\t]*(?=\\n|$)`, 'g');
  closingRe.lastIndex = contentStart;
  const close = closingRe.exec(text);

  if (!close) {
    return {
      index,
      end: text.length,
      raw: text.slice(index),
      content: text.slice(contentStart),
      language,
      partial: true,
    };
  }

  const closingIndex = close.index + (close[1] ? close[1].length : 0);
  return {
    index,
    end: closingIndex + marker.length,
    raw: text.slice(index, closingIndex + marker.length),
    content: text.slice(contentStart, closingIndex),
    language,
    partial: false,
  };
}

function findPair(
  text: string,
  fromIndex: number,
  pairs: readonly (readonly [string, string])[],
) {
  let found:
    | {
        index: number;
        start: string;
        endTag: string;
      }
    | undefined;

  for (const [start, endTag] of pairs) {
    const index = text.toLowerCase().indexOf(start.toLowerCase(), fromIndex);
    if (index !== -1 && (!found || index < found.index)) {
      found = {index, start, endTag};
    }
  }

  if (!found) {
    return undefined;
  }

  const contentStart = found.index + found.start.length;
  const closeIndex = text
    .toLowerCase()
    .indexOf(found.endTag.toLowerCase(), contentStart);

  if (closeIndex === -1) {
    return {
      index: found.index,
      end: text.length,
      raw: text.slice(found.index),
      content: text.slice(contentStart),
      delimiter: found.start,
      partial: true,
    };
  }

  return {
    index: found.index,
    end: closeIndex + found.endTag.length,
    raw: text.slice(found.index, closeIndex + found.endTag.length),
    content: text.slice(contentStart, closeIndex),
    delimiter: found.start,
    partial: false,
  };
}

function findChannelThinking(text: string, fromIndex: number) {
  const channelRe = /<\|channel\|?>\s*(analysis|thought)/gi;
  channelRe.lastIndex = fromIndex;
  const match = channelRe.exec(text);
  if (!match) {
    return undefined;
  }

  const contentStart = channelRe.lastIndex;
  const finalRe = /<\|channel\|?>\s*final/gi;
  finalRe.lastIndex = contentStart;
  const close = finalRe.exec(text);

  if (!close) {
    return {
      index: match.index,
      end: text.length,
      raw: text.slice(match.index),
      content: text.slice(contentStart),
      delimiter: match[0],
      partial: true,
    };
  }

  return {
    index: match.index,
    end: close.index,
    raw: text.slice(match.index, close.index),
    content: text.slice(contentStart, close.index),
    delimiter: match[0],
    partial: false,
  };
}

function findBlockMath(text: string, fromIndex: number) {
  const dollarIndex = findUnescaped(text, '$$', fromIndex);
  const bracketIndex = text.indexOf('\\[', fromIndex);

  const candidates = [
    dollarIndex === -1
      ? undefined
      : {index: dollarIndex, start: '$$', end: '$$'},
    bracketIndex === -1
      ? undefined
      : {index: bracketIndex, start: '\\[', end: '\\]'},
  ].filter(Boolean) as Array<{index: number; start: string; end: string}>;

  if (candidates.length === 0) {
    return undefined;
  }

  const next = candidates.sort((a, b) => a.index - b.index)[0];
  const contentStart = next.index + next.start.length;
  const closeIndex =
    next.end === '$$'
      ? findUnescaped(text, '$$', contentStart)
      : text.indexOf(next.end, contentStart);

  if (closeIndex === -1) {
    return {
      index: next.index,
      end: text.length,
      raw: text.slice(next.index),
      content: text.slice(contentStart),
      delimiter: next.start,
      partial: true,
    };
  }

  return {
    index: next.index,
    end: closeIndex + next.end.length,
    raw: text.slice(next.index, closeIndex + next.end.length),
    content: text.slice(contentStart, closeIndex),
    delimiter: next.start,
    partial: false,
  };
}

function findUnescaped(text: string, needle: string, fromIndex: number) {
  let index = text.indexOf(needle, fromIndex);
  while (index !== -1) {
    let slashCount = 0;
    for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) {
      slashCount++;
    }
    if (slashCount % 2 === 0) {
      return index;
    }
    index = text.indexOf(needle, index + needle.length);
  }
  return -1;
}

function getThinkingPairs(options: MessageParserOptions) {
  const pairs = [...DEFAULT_THINKING_PAIRS];
  if (options.thinkingStartTag && options.thinkingEndTag) {
    pairs.unshift([options.thinkingStartTag, options.thinkingEndTag] as const);
  }
  return pairs;
}

function splitSegments(
  raw: string,
  options: MessageParserOptions,
): MessageSegment[] {
  const segments: MessageSegment[] = [];
  const thinkingPairs = getThinkingPairs(options);
  let index = 0;

  while (index < raw.length) {
    const candidates = [
      {kind: 'code' as const, match: findNextCodeFence(raw, index)},
      {kind: 'thinking' as const, match: findChannelThinking(raw, index)},
      {kind: 'thinking' as const, match: findPair(raw, index, thinkingPairs)},
      {kind: 'tool' as const, match: findPair(raw, index, TOOL_PAIRS)},
      {kind: 'math' as const, match: findBlockMath(raw, index)},
      {kind: 'serviceTag' as const, match: findServiceToken(raw, index)},
    ].filter(candidate => candidate.match !== undefined) as Array<{
      kind: MessageSegment['kind'];
      match: any;
    }>;

    if (candidates.length === 0) {
      pushTextSegment(segments, raw.slice(index));
      break;
    }

    const next = candidates.sort((a, b) => a.match.index - b.match.index)[0];

    if (next.match.index > index) {
      pushTextSegment(segments, raw.slice(index, next.match.index));
    }

    segments.push({
      id: `seg-${segments.length}`,
      kind: next.kind,
      raw: next.match.raw,
      content: next.match.content ?? next.match.raw,
      language: next.match.language || undefined,
      delimiter: next.match.delimiter,
      block: next.kind === 'code' || next.kind === 'math',
      partial: next.match.partial,
      malformed: next.match.partial,
    });

    index = next.match.end ?? next.match.index + next.match.raw.length;
  }

  return segments;
}

function buildMarkdownTextFromSegments(
  segments: MessageSegment[],
  options: MessageParserOptions,
  hideServiceTokens: boolean,
): string {
  return segments
    .map(segment => {
      if (segment.kind === 'thinking') {
        return options.includeThinkingInClean ? segment.raw : '';
      }

      if (segment.kind === 'serviceTag' && hideServiceTokens) {
        return '';
      }

      if (segment.kind === 'tool') {
        return segment.content;
      }

      return segment.raw;
    })
    .join('');
}

export function parseAssistantMessage(
  raw: string,
  options: MessageParserOptions = {},
): ParsedAssistantMessage {
  const hideServiceTokens = options.hideServiceTokens ?? true;
  const segments = splitSegments(raw, options);

  let markdownText = buildMarkdownTextFromSegments(
    segments,
    options,
    hideServiceTokens,
  );
  markdownText = markdownText.replace(/<\/?final>/gi, '');
  markdownText = normalizeCleanText(markdownText);

  const cleanText = normalizeCleanText(markdownText);
  const plainText = markdownToPlainText(cleanText);

  return {
    raw,
    cleanText,
    markdownText,
    plainText,
    hash: hashText(raw),
    segments,
    hasThinking: segments.some(segment => segment.kind === 'thinking'),
    hasServiceTags: hasServiceTokens(raw),
    hasUnsafeHtml: containsUnsafeHtml(raw),
    hasPartialSegment: segments.some(segment => segment.partial),
  };
}

export function getThinkingContent(parsed: ParsedAssistantMessage): string {
  return parsed.segments
    .filter(segment => segment.kind === 'thinking')
    .map(segment => segment.content.trim())
    .filter(Boolean)
    .join('\n\n');
}
