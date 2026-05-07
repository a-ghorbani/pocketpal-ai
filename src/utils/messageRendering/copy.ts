import {parseAssistantMessageCached} from './cache';
import {getThinkingContent} from './parser';
import {
  MessageCopyMode,
  MessageParserOptions,
  MessageSegment,
  MessageWithRenderingMetadata,
} from './types';
import {markdownToPlainText} from './markdown';

export function getMessageRawContent(
  message: MessageWithRenderingMetadata,
): string {
  return (
    message.metadata?.completionResult?.raw_content ||
    message.metadata?.partialCompletionResult?.raw_content ||
    message.metadata?.raw_content ||
    message.text
  );
}

export function buildMessageCopyTextFromMessage(
  message: MessageWithRenderingMetadata,
  mode: MessageCopyMode,
  options: MessageParserOptions = {},
): string {
  return buildMessageCopyText(getMessageRawContent(message), mode, options);
}

export function buildMessageCopyText(
  raw: string,
  mode: MessageCopyMode,
  options: MessageParserOptions = {},
): string {
  if (mode === 'raw') {
    return raw;
  }

  const parsed = parseAssistantMessageCached(raw, options);

  switch (mode) {
    case 'cleanWithThinking': {
      const thinkingText = markdownToPlainText(getThinkingContent(parsed));
      const answerText = parsed.plainText || parsed.cleanText;
      return [thinkingText && `Thinking\n${thinkingText}`, answerText]
        .filter(Boolean)
        .join('\n\n');
    }
    case 'markdown':
      return parsed.markdownText;
    case 'plain':
      return parsed.plainText;
    case 'clean':
    default:
      return parsed.plainText || parsed.cleanText;
  }
}

export function prettyPrintJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function prettyPrintXml(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || !looksLikeBalancedXml(trimmed)) {
    return raw;
  }

  try {
    const tokens = trimmed
      .replace(/>\s+</g, '><')
      .split(/(?=<)|(?<=>)/g)
      .map(token => token.trim())
      .filter(Boolean);

    let depth = 0;
    const lines = tokens.map(token => {
      const isClosingTag = /^<\//.test(token);
      const isSelfClosingTag =
        /\/>$/.test(token) ||
        /^<\?/.test(token) ||
        /^<!/.test(token) ||
        /^<!--/.test(token);

      if (isClosingTag) {
        depth = Math.max(depth - 1, 0);
      }

      const line = `${'  '.repeat(depth)}${token}`;

      if (
        /^<[^/!?][^>]*>$/.test(token) &&
        !isSelfClosingTag &&
        !token.includes('</')
      ) {
        depth += 1;
      }

      return line;
    });

    if (depth !== 0) {
      return raw;
    }

    return lines.join('\n');
  } catch {
    return raw;
  }
}

export function buildSegmentCopyText(
  segment: MessageSegment,
  mode: 'raw' | 'markdown' | 'plain' = 'raw',
): string {
  if (mode === 'raw') {
    return segment.raw;
  }

  if (segment.kind === 'table') {
    return mode === 'plain'
      ? tableMarkdownToPlainText(segment.raw)
      : segment.raw;
  }

  if (segment.kind === 'math') {
    return mode === 'plain' ? segment.content.trim() : segment.raw;
  }

  if (segment.kind === 'json') {
    return prettyPrintJson(segment.content.trim() || segment.raw.trim());
  }

  if (segment.kind === 'xml') {
    return prettyPrintXml(segment.content.trim() || segment.raw.trim());
  }

  return mode === 'plain' ? segment.content.trim() : segment.raw;
}

function looksLikeBalancedXml(raw: string): boolean {
  const stack: string[] = [];
  const tagRe = /<\/?([A-Za-z][\w:-]*)(?:\s[^<>]*)?>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(raw))) {
    const tag = match[0];
    const name = match[1];

    if (
      tag.startsWith('<?') ||
      tag.startsWith('<!') ||
      tag.endsWith('/>') ||
      tag.startsWith('<!--')
    ) {
      continue;
    }

    if (tag.startsWith('</')) {
      if (stack.pop() !== name) {
        return false;
      }
      continue;
    }

    stack.push(name);
  }

  return stack.length === 0;
}

export function tableMarkdownToPlainText(markdown: string): string {
  const rows = markdown
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.includes('|'))
    .map(line =>
      line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map(cell => cell.trim()),
    )
    .filter(row => !row.every(cell => /^:?-{3,}:?$/.test(cell)));

  return rows.map(row => row.join('\t')).join('\n');
}
