export type MessageRenderMode = 'rendered' | 'raw' | 'clean';

export type MessageCopyMode = 'clean' | 'markdown' | 'raw' | 'plain';

export type MessageSegmentKind =
  | 'text'
  | 'markdown'
  | 'code'
  | 'math'
  | 'table'
  | 'thinking'
  | 'serviceTag'
  | 'tool'
  | 'json'
  | 'xml';

export interface MessageRenderingSettings {
  renderMarkdown: boolean;
  renderLatex: boolean;
  renderTables: boolean;
  showThinkingBlocks: boolean;
  collapseThinkingByDefault: boolean;
  hideModelTemplateTokens: boolean;
  defaultCopyMode: Extract<MessageCopyMode, 'clean' | 'markdown' | 'raw'>;
  wrapCodeLines: boolean;
  useSyntaxHighlighting: boolean;
  useCompactTables: boolean;
}

export const defaultMessageRenderingSettings: MessageRenderingSettings = {
  renderMarkdown: true,
  renderLatex: true,
  renderTables: true,
  showThinkingBlocks: true,
  collapseThinkingByDefault: true,
  hideModelTemplateTokens: true,
  defaultCopyMode: 'clean',
  wrapCodeLines: false,
  useSyntaxHighlighting: true,
  useCompactTables: false,
};

export interface MessageParserOptions {
  thinkingStartTag?: string;
  thinkingEndTag?: string;
  includeThinkingInClean?: boolean;
  hideServiceTokens?: boolean;
}

export interface MessageSegment {
  id: string;
  kind: MessageSegmentKind;
  raw: string;
  content: string;
  language?: string;
  delimiter?: string;
  block?: boolean;
  partial?: boolean;
  malformed?: boolean;
}

export interface ParsedAssistantMessage {
  raw: string;
  cleanText: string;
  markdownText: string;
  plainText: string;
  hash: string;
  segments: MessageSegment[];
  hasThinking: boolean;
  hasServiceTags: boolean;
  hasUnsafeHtml: boolean;
  hasPartialSegment: boolean;
}

export interface MessageWithRenderingMetadata {
  text: string;
  metadata?: Record<string, any>;
}
