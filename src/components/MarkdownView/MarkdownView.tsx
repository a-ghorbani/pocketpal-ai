import {View} from 'react-native';
import React, {useContext, useMemo} from 'react';

import {marked} from 'marked';
import {RenderHTMLSource} from 'react-native-render-html';

import {SearchQueryContext} from '../../utils';

marked.use({});

interface MarkdownViewProps {
  markdownText: string;
  maxMessageWidth: number;
  selectable?: boolean;
}

const isEmptyContent = (content: string): boolean => {
  return !content || content.trim() === '';
};

// The five characters marked() escapes in text nodes. Decoding them before
// matching lets the highlight agree with the store's match count, which runs
// on the raw (unescaped) message text.
const decodeBasicEntities = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&'); // amp last, so &amp;lt; doesn't become <

const encodeBasicEntities = (s: string): string =>
  s
    .replace(/&/g, '&amp;') // amp first, so the replacements below aren't re-encoded
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// A genuine opening <pre>/<code> tag: `<code>`, `<pre class="…">`, etc. A
// self-closing `<code/>` deliberately does NOT match — it has no closing tag
// to unwind, so counting it would leak codeDepth and disable highlighting for
// the rest of the message.
const CODE_OPEN = /^<(pre|code)(\s[^>]*)?>$/;
const CODE_CLOSE = /^<\/(pre|code)>/;

/**
 * Wrap search-query matches in `<mark>` tags within the rendered HTML.
 *
 * Operates on `marked()` output, so it:
 *  - skips code/pre regions entirely (injecting elements there breaks the
 *    code renderer), and
 *  - decodes the basic HTML entities in each text node before matching, then
 *    re-encodes everything except the injected `<mark>` tags — so a query
 *    containing `'`, `&`, `<` or `>` highlights, and highlight and count come
 *    from one definition of "match".
 */
export const highlightSearchMatches = (html: string, query: string): string => {
  const trimmed = query.trim();
  if (!trimmed) {
    return html;
  }
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matchRegex = new RegExp(`(${escaped})`, 'gi');

  let codeDepth = 0;
  // Split the HTML into tags and text runs.
  return html.replace(
    /(<[^>]+>)|([^<]+)/g,
    (_full, tag: string, text: string) => {
      if (tag) {
        const lower = tag.toLowerCase();
        if (CODE_OPEN.test(lower)) {
          codeDepth += 1;
        } else if (CODE_CLOSE.test(lower)) {
          codeDepth = Math.max(0, codeDepth - 1);
        }
        return tag;
      }
      if (codeDepth > 0) {
        return text;
      }
      // Decode to the plain text the store matched against, wrap matches, and
      // re-encode the surrounding text so entities stay intact.
      const decoded = decodeBasicEntities(text);
      let result = '';
      let lastIndex = 0;
      decoded.replace(matchRegex, (match: string, _cap: string, offset) => {
        result += encodeBasicEntities(decoded.slice(lastIndex, offset));
        result += `<mark>${encodeBasicEntities(match)}</mark>`;
        lastIndex = offset + match.length;
        return match;
      });
      result += encodeBasicEntities(decoded.slice(lastIndex));
      return result;
    },
  );
};

/**
 * Renders a markdown string inside the app-level RenderHTML provider tree.
 * The engine (parser + tagsStyles + renderers) lives on `MarkdownProvider`
 * at the app root; only `source` and `contentWidth` change here, so per-
 * token streaming updates stay cheap.
 *
 * When a search query is active (via `SearchQueryContext`), matches are
 * wrapped in `<mark>` tags — the `mark` element model and style are
 * registered on `MarkdownProvider`.
 *
 * NOTE: `selectable` is accepted for API compatibility but is currently
 * fixed at the provider level. If a caller ever needs a selectable variant
 * a separate provider scope would have to host it.
 */
export const MarkdownView: React.FC<MarkdownViewProps> = React.memo(
  ({markdownText, maxMessageWidth}) => {
    const searchQuery = useContext(SearchQueryContext);

    // Parse markdown once per message; only re-highlight when the query
    // changes, so keystrokes don't re-run the expensive markdown parse.
    const parsedHtml = useMemo(
      () => marked(markdownText) as string,
      [markdownText],
    );
    const htmlContent = useMemo(
      () => highlightSearchMatches(parsedHtml, searchQuery),
      [parsedHtml, searchQuery],
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
    prevProps.selectable === nextProps.selectable,
);
