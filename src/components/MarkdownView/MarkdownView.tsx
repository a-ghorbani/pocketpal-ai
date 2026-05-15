import {View} from 'react-native';
import React, {useMemo} from 'react';

import {marked} from 'marked';
import RenderHtml, {defaultSystemFonts} from 'react-native-render-html';
import CodeHighlighter from 'react-native-code-highlighter';
import {atomOneDark} from 'react-syntax-highlighter/dist/esm/styles/hljs';

import {useTheme} from '../../hooks';
import {CodeBlockHeader} from '../CodeBlockHeader';

import {
  codeHighlighterPreOverride,
  createStyles,
  createTagsStyles,
} from './styles';
import {tableRenderers, tableHTMLElementModels} from './TableRenderers';

marked.use({});

interface MarkdownViewProps {
  markdownText: string;
  maxMessageWidth: number;
  //isComplete: boolean; // indicating if message is complete
  selectable?: boolean;
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
        }}
        customStyle={codeHighlighterPreOverride}>
        {content}
      </CodeHighlighter>
    </View>
  );
};

export const MarkdownView: React.FC<MarkdownViewProps> = React.memo(
  ({markdownText, maxMessageWidth, selectable = false}) => {
    const _maxWidth = maxMessageWidth;

    const theme = useTheme();
    const styles = createStyles(theme);
    const tagsStyles = useMemo(() => createTagsStyles(theme), [theme]);

    const renderers = useMemo(
      () => ({
        code: (props: any) => CodeRenderer(props),
        ...tableRenderers,
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

    return (
      <View
        testID="markdown-content"
        style={[styles.markdownContainer, {maxWidth: _maxWidth}]}>
        {!isEmptyContent(markdownText) && (
          <RenderHtml
            contentWidth={contentWidth}
            source={source}
            tagsStyles={tagsStyles}
            defaultTextProps={defaultTextProps}
            systemFonts={systemFonts}
            renderers={renderers}
            customHTMLElementModels={tableHTMLElementModels}
          />
        )}
      </View>
    );
  },
  (prevProps, nextProps) =>
    prevProps.markdownText === nextProps.markdownText &&
    //prevProps.isComplete === nextProps.isComplete &&
    prevProps.maxMessageWidth === nextProps.maxMessageWidth &&
    prevProps.selectable === nextProps.selectable,
);
