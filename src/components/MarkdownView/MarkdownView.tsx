import {Text, View} from 'react-native';
import React, {useMemo} from 'react';

import {marked} from 'marked';
import {RenderHTMLSource} from 'react-native-render-html';

import {
  fallbackTablesToCodeBlocks,
  getMarkdownRenderLimits,
  markdownToPlainText,
  prepareMarkdownForRender,
} from '../../utils/messageRendering';

interface MarkdownViewProps {
  markdownText: string;
  maxMessageWidth: number;
  selectable?: boolean;
  renderMarkdown?: boolean;
  renderLatex?: boolean;
  renderTables?: boolean;
}

marked.use({breaks: true, gfm: true});

const isEmptyContent = (content: string): boolean =>
  !content || !content.trim();

/**
 * Renders a markdown string inside the app-level RenderHTML provider tree.
 * The engine (parser + tagsStyles + renderers) lives on `MarkdownProvider`
 * at the app root; only `source` and `contentWidth` change here, so per-
 * token streaming updates stay cheap.
 *
 * NOTE: `selectable` is accepted for API compatibility but is currently
 * fixed at the provider level. If a caller ever needs a selectable variant
 * a separate provider scope would have to host it.
 */
export const MarkdownView: React.FC<MarkdownViewProps> = React.memo(
  ({
    markdownText,
    maxMessageWidth,
    selectable = false,
    renderMarkdown = true,
    renderLatex = true,
    renderTables = true,
  }) => {
    const renderLimits = useMemo(
      () => getMarkdownRenderLimits(markdownText),
      [markdownText],
    );
    const effectiveRenderLatex = renderLatex && !renderLimits.disableLatex;
    const effectiveRenderTables = renderTables && !renderLimits.fallbackTables;
    const plainFallbackText = useMemo(
      () =>
        renderLimits.usePlainTextFallback
          ? markdownToPlainText(markdownText)
          : '',
      [markdownText, renderLimits.usePlainTextFallback],
    );

    const htmlContent = useMemo(() => {
      if (!renderMarkdown || renderLimits.usePlainTextFallback) {
        return '';
      }

      try {
        const markdownInput = effectiveRenderTables
          ? markdownText
          : fallbackTablesToCodeBlocks(markdownText);
        return marked(
          prepareMarkdownForRender(markdownInput, {
            renderLatex: effectiveRenderLatex,
          }),
        ) as string;
      } catch {
        return '';
      }
    }, [
      effectiveRenderLatex,
      effectiveRenderTables,
      markdownText,
      renderLimits.usePlainTextFallback,
      renderMarkdown,
    ]);
    const source = useMemo(() => ({html: htmlContent}), [htmlContent]);

    return (
      <View testID="markdown-content" style={{maxWidth: maxMessageWidth}}>
        {!renderMarkdown && !isEmptyContent(markdownText) && (
          <Text selectable={selectable}>{markdownText}</Text>
        )}
        {renderMarkdown &&
          renderLimits.usePlainTextFallback &&
          !isEmptyContent(markdownText) && (
            <Text selectable={selectable}>
              {plainFallbackText || markdownText}
            </Text>
          )}
        {renderMarkdown &&
          !renderLimits.usePlainTextFallback &&
          !isEmptyContent(markdownText) && (
            <RenderHTMLSource source={source} contentWidth={maxMessageWidth} />
          )}
      </View>
    );
  },
  (prevProps, nextProps) =>
    prevProps.markdownText === nextProps.markdownText &&
    prevProps.maxMessageWidth === nextProps.maxMessageWidth &&
    prevProps.selectable === nextProps.selectable &&
    prevProps.renderMarkdown === nextProps.renderMarkdown &&
    prevProps.renderLatex === nextProps.renderLatex &&
    prevProps.renderTables === nextProps.renderTables,
);
