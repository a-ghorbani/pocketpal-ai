import {parseAssistantMessage} from './parser';
import {
  MessageCopyMode,
  MessageParserOptions,
  MessageWithRenderingMetadata,
} from './types';

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

  const parsed = parseAssistantMessage(raw, options);

  switch (mode) {
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
