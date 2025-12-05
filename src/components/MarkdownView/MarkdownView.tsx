import {View} from 'react-native';
import React, {useMemo} from 'react';

import {marked} from 'marked';
import RenderHtml, {defaultSystemFonts} from 'react-native-render-html';
import CodeHighlighter from 'react-native-code-highlighter';
import {atomOneDark} from 'react-syntax-highlighter/dist/esm/styles/hljs';

import {useTheme} from '../../hooks';
import {ThinkingBubble} from '../ThinkingBubble';
import {CodeBlockHeader} from '../CodeBlockHeader';

import {createTagsStyles, createStyles} from './styles';

marked.use({});

interface MarkdownViewProps {
  markdownText: string;
  maxMessageWidth: number;
  //isComplete: boolean; // indicating if message is complete
  selectable?: boolean;
  /** Optional reasoning/thinking content */
  reasoningContent?: string;
}

// Helper function to check if content is empty
const isEmptyContent = (content: string): boolean => {
  return !content || content.trim() === '';
};

// Helper to decode HTML entities
const decodeHTMLEntities = (text: string): string => {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&#x27;': "'",
    '&nbsp;': ' ',
    '&apos;': "'",
  };

  // Replace named entities
  let decoded = text.replace(
    /&[a-z]+;/gi,
    entity => entities[entity] || entity,
  );

  // Replace numeric entities (&#123; and &#xAB;)
  decoded = decoded.replace(/&#(\d+);/g, (_match, dec) =>
    String.fromCharCode(parseInt(dec, 10)),
  );
  decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (_match, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );

  return decoded;
};

const CodeRenderer = ({TDefaultRenderer, ...props}: any) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const isCodeBlock = props?.tnode?.parent?.tagName === 'pre';

  // if not code block, use the default renderer
  if (!isCodeBlock) {
    return <TDefaultRenderer {...props} />;
  }

  const language =
    props.tnode?.domNode?.attribs?.class?.replace('language-', '') || 'text';

  // Extract content from the original HTML to preserve newlines
  // The react-native-render-html parser collapses whitespace in the DOM,
  // so we need to get the content from tnode.init which preserves the original text
  const rawHtml =
    props.tnode?.init?.domNode?.rawHTML ||
    props.tnode?.domNode?.rawHTML ||
    props.tnode?.domNode?.children?.[0]?.data ||
    '';

  // Decode HTML entities (&lt; -> <, &gt; -> >, etc.)
  const content = decodeHTMLEntities(rawHtml);

  return (
    <View>
      <CodeBlockHeader language={language} content={content} />
      <CodeHighlighter
        hljsStyle={atomOneDark}
        language={language}
        textStyle={styles.codeHighlighterText}
        scrollViewProps={{
          contentContainerStyle: styles.codeHighlighterScrollContent,
        }}>
        {content}
      </CodeHighlighter>
    </View>
  );
};

export const MarkdownView: React.FC<MarkdownViewProps> = React.memo(
  ({markdownText, maxMessageWidth, selectable = false, reasoningContent}) => {
    const _maxWidth = maxMessageWidth;

    const theme = useTheme();
    const styles = createStyles(theme);
    const tagsStyles = useMemo(() => createTagsStyles(theme), [theme]);

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

    const renderers = useMemo(
      () => ({
        code: (props: any) => CodeRenderer(props),
      }),
      [],
    );

    const defaultTextProps = useMemo(
      () => ({
        selectable,
        userSelect: selectable ? 'text' : 'none',
      }),
      [selectable],
    );
    const systemFonts = useMemo(() => defaultSystemFonts, []);

    const contentWidth = useMemo(() => _maxWidth, [_maxWidth]);

    const htmlContent = useMemo(
      () => marked(markdownText) as string,
      [markdownText],
    );
    const source = useMemo(() => ({html: htmlContent}), [htmlContent]);

    // Render reasoning content as markdown if present
    const reasoningHtmlContent = useMemo(
      () => (reasoningContent ? (marked(reasoningContent) as string) : null),
      [reasoningContent],
    );
    const reasoningSource = useMemo(
      () => (reasoningHtmlContent ? {html: reasoningHtmlContent} : null),
      [reasoningHtmlContent],
    );

    return (
      <View
        testID="chatMarkdownScrollView"
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
            />
          </ThinkingBubble>
        )}

        {/* Render main content only if it's not empty */}
        {!isEmptyContent(markdownText) && (
          <RenderHtml
            contentWidth={contentWidth}
            source={source}
            tagsStyles={tagsStyles}
            defaultTextProps={defaultTextProps}
            systemFonts={systemFonts}
            renderers={renderers}
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
    prevProps.reasoningContent === nextProps.reasoningContent,
);
