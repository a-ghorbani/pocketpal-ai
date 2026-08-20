import {View} from 'react-native';
import React, {useContext, useMemo} from 'react';

import {RenderHTMLSource} from 'react-native-render-html';

import {highlightMatches} from '../../utils/searchIndex';
import {SearchQueryContext} from '../../utils';

interface MarkdownViewProps {
  markdownText: string;
  maxMessageWidth: number;
  selectable?: boolean;
  /** Which of this chunk's matches the search navigator is currently on. */
  activeMatchOrdinal?: number;
}

const isEmptyContent = (content: string): boolean => {
  return !content || content.trim() === '';
};

/**
 * Renders a markdown string inside the app-level RenderHTML provider tree.
 * The engine (parser + tagsStyles + renderers) lives on `MarkdownProvider`
 * at the app root; only `source` and `contentWidth` change here, so per-
 * token streaming updates stay cheap.
 *
 * When a search query is active (via `SearchQueryContext`), matches are
 * wrapped in `<mark>` tags — the `mark` element model and style are
 * registered on `MarkdownProvider`. The markdown parse is cached by
 * `searchIndex`, so a keystroke only re-runs the match and splice.
 *
 * NOTE: `selectable` is accepted for API compatibility but is currently
 * fixed at the provider level. If a caller ever needs a selectable variant
 * a separate provider scope would have to host it.
 */
export const MarkdownView: React.FC<MarkdownViewProps> = React.memo(
  ({markdownText, maxMessageWidth, activeMatchOrdinal}) => {
    const searchQuery = useContext(SearchQueryContext);

    const htmlContent = useMemo(
      () => highlightMatches(markdownText, searchQuery, activeMatchOrdinal),
      [markdownText, searchQuery, activeMatchOrdinal],
    );
    const source = useMemo(() => ({html: htmlContent}), [htmlContent]);

    return (
      <View testID="markdown-content" style={{maxWidth: maxMessageWidth}}>
        {!isEmptyContent(markdownText) && (
          <RenderHTMLSource source={source} contentWidth={maxMessageWidth} />
        )}
      </View>
    );
  },
  (prevProps, nextProps) =>
    prevProps.markdownText === nextProps.markdownText &&
    prevProps.maxMessageWidth === nextProps.maxMessageWidth &&
    prevProps.selectable === nextProps.selectable &&
    prevProps.activeMatchOrdinal === nextProps.activeMatchOrdinal,
);
