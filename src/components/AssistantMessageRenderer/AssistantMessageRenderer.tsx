import React, {useMemo} from 'react';
import {Text, View} from 'react-native';
import {observer} from 'mobx-react-lite';

import {MarkdownView} from '../MarkdownView';
import {ThinkingBubble} from '../ThinkingBubble';
import {useTheme} from '../../hooks';
import {modelStore, uiStore} from '../../store';
import {
  defaultMessageRenderingSettings,
  getThinkingContent,
  parseAssistantMessage,
  MessageRenderMode,
  MessageSegment,
  prettyPrintJson,
} from '../../utils/messageRendering';

import {createStyles} from './styles';

interface AssistantMessageRendererProps {
  content: string;
  messageId: string;
  maxMessageWidth: number;
  mode?: MessageRenderMode;
  selectable?: boolean;
  reasoningContent?: string;
}

function fencedBlock(language: string, content: string): string {
  const fence = content.includes('```') ? '~~~~' : '```';
  const normalizedContent = content.endsWith('\n') ? content : `${content}\n`;
  return `${fence}${language}\n${normalizedContent}${fence}`;
}

function segmentToMarkdown(segment: MessageSegment): string | undefined {
  const trimmedContent = segment.content.trim();

  switch (segment.kind) {
    case 'thinking':
    case 'serviceTag':
      return undefined;
    case 'code':
      return fencedBlock(segment.language || 'text', segment.content);
    case 'json':
      return fencedBlock('json', prettyPrintJson(trimmedContent));
    case 'xml':
      return fencedBlock('xml', trimmedContent);
    case 'tool': {
      const prettyToolContent = prettyPrintJson(trimmedContent);
      const language = /^[{[]/.test(trimmedContent) ? 'json' : 'text';
      return fencedBlock(language, prettyToolContent);
    }
    case 'math':
    case 'table':
      return segment.raw;
    case 'markdown':
    case 'text':
    default:
      return segment.content.replace(/<\/?final>/gi, '');
  }
}

export const AssistantMessageRenderer: React.FC<AssistantMessageRendererProps> =
  observer(
    ({
      content,
      messageId,
      maxMessageWidth,
      mode = 'rendered',
      selectable = false,
      reasoningContent,
    }) => {
      const theme = useTheme();
      const styles = createStyles(theme);
      const settings = {
        ...defaultMessageRenderingSettings,
        ...uiStore.messageRenderingSettings,
      };
      const thinkingStartTag = modelStore.activeModel?.thinkingStartTag;
      const thinkingEndTag = modelStore.activeModel?.thinkingEndTag;

      const parsed = useMemo(
        () =>
          parseAssistantMessage(content, {
            thinkingStartTag,
            thinkingEndTag,
            hideServiceTokens: settings.hideModelTemplateTokens,
          }),
        [
          content,
          settings.hideModelTemplateTokens,
          thinkingEndTag,
          thinkingStartTag,
        ],
      );

      const parsedThinkingContent = useMemo(
        () => getThinkingContent(parsed),
        [parsed],
      );

      const thinkingContent =
        reasoningContent?.trim() || parsedThinkingContent.trim();
      const visibleSegmentMarkdown = useMemo(
        () =>
          parsed.segments
            .map(segmentToMarkdown)
            .filter((value): value is string => !!value?.trim()),
        [parsed],
      );

      if (mode === 'raw') {
        return (
          <Text selectable={selectable} style={styles.rawText}>
            {content}
          </Text>
        );
      }

      if (mode === 'clean') {
        return (
          <Text selectable={selectable} style={styles.rawText}>
            {parsed.plainText || parsed.cleanText}
          </Text>
        );
      }

      return (
        <View
          testID={`assistant-message-renderer-${messageId}`}
          style={styles.container}>
          {settings.showThinkingBlocks && !!thinkingContent && (
            <ThinkingBubble
              initiallyCollapsed={settings.collapseThinkingByDefault}>
              <MarkdownView
                markdownText={thinkingContent}
                maxMessageWidth={maxMessageWidth}
                selectable={selectable}
                renderMarkdown={settings.renderMarkdown}
                renderLatex={settings.renderLatex}
                renderTables={settings.renderTables}
                wrapCodeLines={settings.wrapCodeLines}
                useSyntaxHighlighting={settings.useSyntaxHighlighting}
                useCompactTables={settings.useCompactTables}
                showThinkingBlocks={false}
              />
            </ThinkingBubble>
          )}

          {(visibleSegmentMarkdown.length
            ? visibleSegmentMarkdown
            : [parsed.markdownText]
          ).map((segmentMarkdown, index) => (
            <MarkdownView
              key={`${parsed.hash}-${index}`}
              markdownText={segmentMarkdown}
              maxMessageWidth={maxMessageWidth}
              selectable={selectable}
              renderMarkdown={settings.renderMarkdown}
              renderLatex={settings.renderLatex}
              renderTables={settings.renderTables}
              wrapCodeLines={settings.wrapCodeLines}
              useSyntaxHighlighting={settings.useSyntaxHighlighting}
              useCompactTables={settings.useCompactTables}
              showThinkingBlocks={false}
            />
          ))}
        </View>
      );
    },
  );
