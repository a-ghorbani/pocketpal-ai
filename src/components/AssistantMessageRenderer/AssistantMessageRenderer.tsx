import React, {useMemo, useState} from 'react';
import {ScrollView, Text, TouchableOpacity, View} from 'react-native';
import {observer} from 'mobx-react-lite';
import Clipboard from '@react-native-clipboard/clipboard';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

import {ChevronDownIcon, CopyIcon} from '../../assets/icons';
import {MarkdownView} from '../MarkdownView';
import {ThinkingBubble} from '../ThinkingBubble';
import {useTheme} from '../../hooks';
import {modelStore, uiStore} from '../../store';
import {
  buildSegmentCopyText,
  defaultMessageRenderingSettings,
  getThinkingContent,
  parseAssistantMessage,
  MessageRenderMode,
  MessageSegment,
  prettyPrintJson,
  prettyPrintXml,
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

const hapticOptions = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

function fencedBlock(language: string, content: string): string {
  const fence = content.includes('```') ? '~~~~' : '```';
  const normalizedContent = content.endsWith('\n') ? content : `${content}\n`;
  return `${fence}${language}\n${normalizedContent}${fence}`;
}

function isStructuredSegment(segment: MessageSegment): boolean {
  return (
    segment.kind === 'json' || segment.kind === 'xml' || segment.kind === 'tool'
  );
}

function isCopyableRenderedSegment(segment: MessageSegment): boolean {
  return segment.kind === 'table' || segment.kind === 'math';
}

function segmentToMarkdown(segment: MessageSegment): string | undefined {
  switch (segment.kind) {
    case 'thinking':
    case 'serviceTag':
    case 'json':
    case 'xml':
    case 'tool':
      return undefined;
    case 'code':
      return fencedBlock(segment.language || 'text', segment.content);
    case 'math':
    case 'table':
      return segment.raw;
    case 'markdown':
    case 'text':
    default:
      return segment.content.replace(/<\/?final>/gi, '');
  }
}

function getStructuredSegmentTitle(segment: MessageSegment): string {
  if (segment.kind === 'json') {
    return segment.malformed ? 'JSON fallback' : 'JSON';
  }

  if (segment.kind === 'xml') {
    return segment.malformed ? 'XML fallback' : 'XML';
  }

  if (/function_call/i.test(segment.delimiter || segment.raw)) {
    return 'function_call';
  }

  return 'tool_call';
}

function getStructuredSegmentLanguage(segment: MessageSegment): string {
  const content = segment.content.trim();

  if (segment.kind === 'json' || /^[{[]/.test(content)) {
    return 'json';
  }

  if (segment.kind === 'xml' || content.startsWith('<')) {
    return 'xml';
  }

  return 'text';
}

function getStructuredSegmentDisplayContent(segment: MessageSegment): string {
  const content = segment.content.trim() || segment.raw.trim();
  const language = getStructuredSegmentLanguage(segment);

  if (language === 'json') {
    return prettyPrintJson(content);
  }

  if (language === 'xml') {
    return prettyPrintXml(content);
  }

  return content;
}

interface StructuredSegmentBlockProps {
  segment: MessageSegment;
  selectable?: boolean;
}

const StructuredSegmentBlock: React.FC<StructuredSegmentBlockProps> = ({
  segment,
  selectable,
}) => {
  const [collapsed, setCollapsed] = useState(true);
  const theme = useTheme();
  const styles = createStyles(theme);
  const title = getStructuredSegmentTitle(segment);
  const language = getStructuredSegmentLanguage(segment);
  const displayContent = getStructuredSegmentDisplayContent(segment);

  const handleCopy = () => {
    ReactNativeHapticFeedback.trigger('impactLight', hapticOptions);
    Clipboard.setString(segment.raw);
  };

  return (
    <View style={styles.structuredBlock}>
      <View style={styles.structuredHeader}>
        <TouchableOpacity
          accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} ${title}`}
          activeOpacity={0.75}
          onPress={() => setCollapsed(value => !value)}
          style={styles.structuredToggle}>
          <View
            style={[
              styles.structuredChevron,
              !collapsed && styles.structuredChevronExpanded,
            ]}>
            <ChevronDownIcon
              width={16}
              height={16}
              stroke={theme.colors.onSurfaceVariant}
            />
          </View>
          <Text style={styles.structuredTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.structuredLanguage} numberOfLines={1}>
            {language}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityLabel={`Copy raw ${title} segment`}
          activeOpacity={0.75}
          onPress={handleCopy}
          style={styles.structuredCopyButton}>
          <CopyIcon
            width={16}
            height={16}
            stroke={theme.colors.onSurfaceVariant}
          />
        </TouchableOpacity>
      </View>

      {!collapsed && (
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator
          style={styles.structuredScroll}
          contentContainerStyle={styles.structuredScrollContent}>
          <Text selectable={selectable} style={styles.structuredCodeText}>
            {displayContent}
          </Text>
        </ScrollView>
      )}
    </View>
  );
};

interface CopyableRenderedSegmentBlockProps {
  segment: MessageSegment;
  children: React.ReactNode;
}

const CopyableRenderedSegmentBlock: React.FC<
  CopyableRenderedSegmentBlockProps
> = ({segment, children}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const title = segment.kind === 'table' ? 'Table' : 'Math';
  const actions =
    segment.kind === 'table'
      ? [
          {label: 'MD', mode: 'markdown' as const},
          {label: 'Text', mode: 'plain' as const},
        ]
      : [{label: 'TeX', mode: 'raw' as const}];

  const handleCopy = (mode: 'raw' | 'markdown' | 'plain') => {
    ReactNativeHapticFeedback.trigger('impactLight', hapticOptions);
    Clipboard.setString(buildSegmentCopyText(segment, mode));
  };

  return (
    <View style={styles.renderedSegmentBlock}>
      <View style={styles.renderedSegmentHeader}>
        <Text style={styles.renderedSegmentTitle}>{title}</Text>
        <View style={styles.renderedSegmentActions}>
          {actions.map(action => (
            <TouchableOpacity
              key={action.label}
              accessibilityLabel={`Copy ${title} as ${action.label}`}
              activeOpacity={0.75}
              onPress={() => handleCopy(action.mode)}
              style={styles.renderedSegmentCopyButton}>
              <CopyIcon
                width={14}
                height={14}
                stroke={theme.colors.onSurfaceVariant}
              />
              <Text style={styles.renderedSegmentCopyText}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={styles.renderedSegmentContent}>{children}</View>
    </View>
  );
};

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

          {parsed.segments.some(
            segment =>
              isStructuredSegment(segment) ||
              isCopyableRenderedSegment(segment),
          )
            ? parsed.segments.map((segment, index) => {
                if (isStructuredSegment(segment)) {
                  return (
                    <StructuredSegmentBlock
                      key={segment.id}
                      segment={segment}
                      selectable={selectable}
                    />
                  );
                }

                const segmentMarkdown = segmentToMarkdown(segment);
                if (!segmentMarkdown?.trim()) {
                  return null;
                }

                const markdownView = (
                  <MarkdownView
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
                );

                if (isCopyableRenderedSegment(segment)) {
                  return (
                    <CopyableRenderedSegmentBlock
                      key={segment.id}
                      segment={segment}>
                      {markdownView}
                    </CopyableRenderedSegmentBlock>
                  );
                }

                return (
                  <React.Fragment key={`${parsed.hash}-${index}`}>
                    {markdownView}
                  </React.Fragment>
                );
              })
            : (visibleSegmentMarkdown.length
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
