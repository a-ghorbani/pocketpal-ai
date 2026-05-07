import {Linking, ScrollView, Text, View} from 'react-native';
import React, {useCallback, useMemo, useState} from 'react';

import {marked} from 'marked';
import RenderHtml, {defaultSystemFonts} from 'react-native-render-html';
import CodeHighlighter from 'react-native-code-highlighter';
import {atomOneDark} from 'react-syntax-highlighter/dist/esm/styles/hljs';

import {useTheme} from '../../hooks';
import {ThinkingBubble} from '../ThinkingBubble';
import {CodeBlockHeader} from '../CodeBlockHeader';

import {createTagsStyles, createStyles} from './styles';
import {tableRenderers, tableHTMLElementModels} from './TableRenderers';
import {
  decodeHtmlEntities,
  fallbackTablesToCodeBlocks,
  getMarkdownRenderLimits,
  isSafeLinkUrl,
  markdownToPlainText,
  prepareMarkdownForRender,
} from '../../utils/messageRendering';

marked.use({breaks: true, gfm: true});

interface MarkdownViewProps {
  markdownText: string;
  maxMessageWidth: number;
  //isComplete: boolean; // indicating if message is complete
  selectable?: boolean;
  /** Optional reasoning/thinking content */
  reasoningContent?: string;
  renderMarkdown?: boolean;
  renderLatex?: boolean;
  renderTables?: boolean;
  wrapCodeLines?: boolean;
  useSyntaxHighlighting?: boolean;
  useCompactTables?: boolean;
  showThinkingBlocks?: boolean;
}

// Helper function to check if content is empty
const isEmptyContent = (content: string): boolean => {
  return !content || content.trim() === '';
};

const CodeRenderer = ({
  TDefaultRenderer,
  initialWrapCodeLines = false,
  useSyntaxHighlighting = true,
  ...props
}: any) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [wrapLines, setWrapLines] = useState(initialWrapCodeLines);
  const isCodeBlock = props?.tnode?.parent?.tagName === 'pre';

  // if not code block, use the default renderer
  if (!isCodeBlock) {
    return <TDefaultRenderer {...props} />;
  }

  const className = props.tnode?.domNode?.attribs?.class || '';
  const language =
    className
      .split(/\s+/)
      .find((name: string) => name.startsWith('language-'))
      ?.replace('language-', '') ||
    className.replace('language-', '').split(/\s+/)[0] ||
    'text';

  // Extract content from the original HTML to preserve newlines
  // The react-native-render-html parser collapses whitespace in the DOM,
  // so we need to get the content from tnode.init which preserves the original text
  const rawHtml =
    props.tnode?.init?.domNode?.rawHTML ||
    props.tnode?.domNode?.rawHTML ||
    props.tnode?.domNode?.children?.[0]?.data ||
    '';

  // Decode HTML entities (&lt; -> <, &gt; -> >, etc.)
  const content = decodeHtmlEntities(rawHtml);

  const fallbackCode = (
    <ScrollView
      horizontal={!wrapLines}
      nestedScrollEnabled
      style={styles.codeFallbackScroll}
      contentContainerStyle={styles.codeFallbackContent}>
      <Text
        selectable
        style={[styles.codeFallbackText, wrapLines && styles.codeWrapText]}>
        {content}
      </Text>
    </ScrollView>
  );

  return (
    <View>
      <CodeBlockHeader
        language={language}
        content={content}
        wrapLines={wrapLines}
        onToggleWrapLines={() => setWrapLines(value => !value)}
      />
      {useSyntaxHighlighting ? (
        <CodeHighlighter
          hljsStyle={atomOneDark}
          language={language}
          textStyle={[
            styles.codeHighlighterText,
            wrapLines && styles.codeWrapText,
          ]}
          scrollViewProps={{
            horizontal: !wrapLines,
            nestedScrollEnabled: true,
            contentContainerStyle: styles.codeHighlighterScrollContent,
          }}>
          {content}
        </CodeHighlighter>
      ) : (
        fallbackCode
      )}
    </View>
  );
};

const MathRenderer = ({TDefaultRenderer, ...props}: any) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const attribs = props.tnode?.domNode?.attribs || {};
  const kind = attribs['data-pp-math'];

  if (!kind) {
    return <TDefaultRenderer {...props} />;
  }

  const content = decodeHtmlEntities(attribs['data-source'] || '');

  if (kind === 'inline') {
    return (
      <Text selectable style={styles.inlineMath}>
        {content}
      </Text>
    );
  }

  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      style={styles.mathBlockScroll}
      contentContainerStyle={styles.mathBlockContent}>
      <Text selectable style={styles.mathBlockText}>
        {content}
      </Text>
    </ScrollView>
  );
};

export const MarkdownView: React.FC<MarkdownViewProps> = React.memo(
  ({
    markdownText,
    maxMessageWidth,
    selectable = false,
    reasoningContent,
    renderMarkdown = true,
    renderLatex = true,
    renderTables = true,
    wrapCodeLines = false,
    useSyntaxHighlighting = true,
    showThinkingBlocks = true,
  }) => {
    const _maxWidth = maxMessageWidth;

    const theme = useTheme();
    const styles = createStyles(theme);
    const tagsStyles = useMemo(() => createTagsStyles(theme), [theme]);
    const renderLimits = useMemo(
      () => getMarkdownRenderLimits(markdownText),
      [markdownText],
    );
    const effectiveRenderLatex = renderLatex && !renderLimits.disableLatex;
    const effectiveRenderTables = renderTables && !renderLimits.fallbackTables;
    const effectiveUseSyntaxHighlighting =
      useSyntaxHighlighting && !renderLimits.disableSyntaxHighlighting;
    const plainFallbackText = useMemo(
      () =>
        renderLimits.usePlainTextFallback
          ? markdownToPlainText(markdownText)
          : '',
      [markdownText, renderLimits.usePlainTextFallback],
    );

    // Create separate tag styles for reasoning content with thinking bubble styling
    const reasoningTagsStyles = useMemo(
      () => ({
        ...tagsStyles,
        body: {
          ...tagsStyles.body,
          color: theme.colors.thinkingBubbleText,
          fontSize: 14,
          lineHeight: 20,
        },
      }),
      [tagsStyles, theme],
    );

    const renderers = useMemo(() => {
      const enabledRenderers: Record<string, any> = {
        code: (props: any) =>
          CodeRenderer({
            ...props,
            initialWrapCodeLines: wrapCodeLines,
            useSyntaxHighlighting: effectiveUseSyntaxHighlighting,
          }),
        span: (props: any) => MathRenderer(props),
        div: (props: any) => MathRenderer(props),
      };

      if (effectiveRenderTables) {
        Object.assign(enabledRenderers, tableRenderers);
      }

      return enabledRenderers;
    }, [effectiveRenderTables, effectiveUseSyntaxHighlighting, wrapCodeLines]);

    const defaultTextProps = useMemo(
      () => ({
        selectable,
        userSelect: selectable ? 'text' : 'none',
      }),
      [selectable],
    );
    const systemFonts = useMemo(() => defaultSystemFonts, []);

    const contentWidth = useMemo(() => _maxWidth, [_maxWidth]);
    const handleLinkPress = useCallback((_event: unknown, href: string) => {
      const safeHref = decodeHtmlEntities(href || '').trim();
      if (!isSafeLinkUrl(safeHref)) {
        return;
      }

      Promise.resolve(Linking.openURL(safeHref)).catch(error =>
        console.warn('[MarkdownView] Failed to open link:', error),
      );
    }, []);
    const renderersProps = useMemo(
      () => ({
        a: {
          onPress: handleLinkPress,
        },
      }),
      [handleLinkPress],
    );

    const htmlContent = useMemo(() => {
      if (!renderMarkdown) {
        return '';
      }

      if (renderLimits.usePlainTextFallback) {
        return '';
      }

      try {
        const markdownInput = effectiveRenderTables
          ? markdownText
          : fallbackTablesToCodeBlocks(markdownText);
        const preparedMarkdown = prepareMarkdownForRender(markdownInput, {
          renderLatex: effectiveRenderLatex,
        });
        return marked(preparedMarkdown) as string;
      } catch {
        return `<p>${prepareMarkdownForRender(markdownText, {
          renderLatex: false,
        })}</p>`;
      }
    }, [
      effectiveRenderLatex,
      effectiveRenderTables,
      markdownText,
      renderLimits.usePlainTextFallback,
      renderMarkdown,
    ]);
    const source = useMemo(() => ({html: htmlContent}), [htmlContent]);

    // Render reasoning content as markdown if present
    const reasoningHtmlContent = useMemo(() => {
      if (
        !reasoningContent ||
        !showThinkingBlocks ||
        !renderMarkdown ||
        renderLimits.usePlainTextFallback
      ) {
        return null;
      }

      try {
        return marked(
          prepareMarkdownForRender(reasoningContent, {
            renderLatex: effectiveRenderLatex,
          }),
        ) as string;
      } catch {
        return `<p>${prepareMarkdownForRender(reasoningContent, {
          renderLatex: false,
        })}</p>`;
      }
    }, [
      effectiveRenderLatex,
      reasoningContent,
      renderLimits.usePlainTextFallback,
      renderMarkdown,
      showThinkingBlocks,
    ]);
    const reasoningSource = useMemo(
      () => (reasoningHtmlContent ? {html: reasoningHtmlContent} : null),
      [reasoningHtmlContent],
    );

    return (
      <View
        testID="markdown-content"
        style={[styles.markdownContainer, {maxWidth: _maxWidth}]}>
        {/* Render reasoning/thinking content first if present */}
        {reasoningSource && !isEmptyContent(reasoningContent || '') && (
          <ThinkingBubble>
            <RenderHtml
              contentWidth={contentWidth}
              source={reasoningSource}
              tagsStyles={reasoningTagsStyles}
              defaultTextProps={defaultTextProps}
              systemFonts={systemFonts}
              renderers={renderers}
              customHTMLElementModels={
                effectiveRenderTables ? tableHTMLElementModels : undefined
              }
              renderersProps={renderersProps}
            />
          </ThinkingBubble>
        )}

        {/* Render main content only if it's not empty */}
        {!renderMarkdown && !isEmptyContent(markdownText) && (
          <Text selectable={selectable} style={tagsStyles.body}>
            {markdownText}
          </Text>
        )}
        {renderMarkdown &&
          renderLimits.usePlainTextFallback &&
          !isEmptyContent(markdownText) && (
            <Text selectable={selectable} style={tagsStyles.body}>
              {plainFallbackText || markdownText}
            </Text>
          )}
        {renderMarkdown &&
          !renderLimits.usePlainTextFallback &&
          !isEmptyContent(markdownText) && (
            <RenderHtml
              contentWidth={contentWidth}
              source={source}
              tagsStyles={tagsStyles}
              defaultTextProps={defaultTextProps}
              systemFonts={systemFonts}
              renderers={renderers}
              customHTMLElementModels={
                effectiveRenderTables ? tableHTMLElementModels : undefined
              }
              renderersProps={renderersProps}
            />
          )}
      </View>
    );
  },
  (prevProps, nextProps) =>
    prevProps.markdownText === nextProps.markdownText &&
    //prevProps.isComplete === nextProps.isComplete &&
    prevProps.maxMessageWidth === nextProps.maxMessageWidth &&
    prevProps.selectable === nextProps.selectable &&
    prevProps.reasoningContent === nextProps.reasoningContent &&
    prevProps.renderMarkdown === nextProps.renderMarkdown &&
    prevProps.renderLatex === nextProps.renderLatex &&
    prevProps.renderTables === nextProps.renderTables &&
    prevProps.wrapCodeLines === nextProps.wrapCodeLines &&
    prevProps.useSyntaxHighlighting === nextProps.useSyntaxHighlighting &&
    prevProps.useCompactTables === nextProps.useCompactTables &&
    prevProps.showThinkingBlocks === nextProps.showThinkingBlocks,
);
