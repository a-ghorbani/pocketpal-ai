import {View} from 'react-native';
import React, {useMemo} from 'react';

import {marked} from 'marked';
import {RenderHTMLSource} from 'react-native-render-html';

import {
  findTableRanges,
  MAX_MATH_PER_MESSAGE,
  mathFallbackMarkdown,
  splitTextWithMath,
} from '../../utils/latex';
import type {LatexSegment} from '../../utils/latex';

import {LatexBlock} from './LatexBlock';
import {MathParagraphView} from './MathParagraphView';

marked.use({});

interface MarkdownViewProps {
  markdownText: string;
  maxMessageWidth: number;
  selectable?: boolean;
}

const isEmptyContent = (content: string): boolean => {
  return !content || content.trim() === '';
};

type RenderBlock =
  | {key: string; kind: 'math'; tex: string; displayMode: boolean}
  | {key: string; kind: 'text'; source: {html: string}}
  | {key: string; kind: 'para'; raw: string};

const FENCE_MARKER_RE = /(`{3,}|~{3,})/;

/**
 * Text that must stay on the native markdown path even inside a flow:
 * fenced code blocks (browser <pre> would lose copy/syntax styling) and
 * table blocks (must keep the native table renderer).
 */
const isNativeOnlyText = (raw: string): boolean =>
  FENCE_MARKER_RE.test(raw) || findTableRanges(raw).length > 0;

/**
 * Renders a markdown string inside the app-level RenderHTML provider tree.
 * The engine (parser + tagsStyles + renderers) lives on `MarkdownProvider`
 * at the app root; only `source` and `contentWidth` change here, so per-
 * token streaming updates stay cheap.
 *
 * LaTeX: the message is first split by `splitTextWithMath`. Display math
 * renders centered via `LatexBlock`. Runs of prose + inline math become
 * flow groups — each paragraph mounts one `MathParagraphView` so formulas
 * sit inside the sentence (punctuation attached) with true in-flow layout.
 * Code fences and tables stay native. At most MAX_MATH_PER_MESSAGE formulas
 * mount a WebView — beyond that the raw TeX falls back to code so content
 * is never lost. Messages without math produce exactly one text block,
 * identical to the previous behavior.
 *
 * NOTE: `selectable` is accepted for API compatibility but is currently
 * fixed at the provider level. If a caller ever needs a selectable variant
 * a separate provider scope would have to host it.
 */
export const MarkdownView: React.FC<MarkdownViewProps> = React.memo(
  ({markdownText, maxMessageWidth}) => {
    const blocks = useMemo(() => {
      const segments = splitTextWithMath(markdownText);
      const out: RenderBlock[] = [];
      let flow: LatexSegment[] = [];
      let mathCount = 0;
      let keyIndex = 0;

      const pushTextBlock = (raw: string): void => {
        if (raw.trim() === '') {
          return;
        }
        out.push({
          key: `flow-${keyIndex++}`,
          kind: 'text',
          source: {html: marked(raw) as string},
        });
      };

      const pushFlowParagraphs = (): void => {
        if (flow.length === 0) {
          return;
        }
        const current = flow;
        flow = [];
        if (!current.some(s => s.type === 'math')) {
          // Pure prose (currency `$` etc. included): single native render,
          // exactly like before.
          pushTextBlock(current.map(s => s.raw).join(''));
          return;
        }
        const raw = current.map(s => s.raw).join('');
        for (const para of raw.split(/\n\s*\n/)) {
          if (para.trim() === '') {
            continue;
          }
          const paraSegments = splitTextWithMath(para);
          const inlineCount = paraSegments.filter(
            s => s.type === 'math',
          ).length;
          if (inlineCount === 0) {
            pushTextBlock(para);
          } else if (mathCount + inlineCount <= MAX_MATH_PER_MESSAGE) {
            mathCount += inlineCount;
            out.push({key: `flow-${keyIndex++}`, kind: 'para', raw: para});
          } else {
            // Over the WebView cap: native pieces, math as code.
            for (const seg of paraSegments) {
              if (seg.type === 'math') {
                pushTextBlock(mathFallbackMarkdown(false, seg.raw));
              } else {
                pushTextBlock(seg.content);
              }
            }
          }
        }
      };

      for (const seg of segments) {
        if (seg.type === 'math' && seg.displayMode) {
          pushFlowParagraphs();
          if (mathCount < MAX_MATH_PER_MESSAGE) {
            mathCount += 1;
            out.push({
              key: `seg-${keyIndex++}`,
              kind: 'math',
              tex: seg.content,
              displayMode: true,
            });
          } else {
            // Over the WebView cap: show raw TeX as code so it stays
            // readable without mounting more WebViews.
            const fallbackMd = mathFallbackMarkdown(true, seg.raw);
            out.push({
              key: `seg-${keyIndex++}`,
              kind: 'text',
              source: {html: marked(fallbackMd) as string},
            });
          }
          continue;
        }
        if (seg.type === 'text' && isNativeOnlyText(seg.raw)) {
          pushFlowParagraphs();
          pushTextBlock(seg.content);
          continue;
        }
        flow.push(seg);
      }
      pushFlowParagraphs();
      return out;
    }, [markdownText]);

    return (
      <View testID="markdown-content" style={{maxWidth: maxMessageWidth}}>
        {!isEmptyContent(markdownText) &&
          blocks.map(block =>
            block.kind === 'math' ? (
              <LatexBlock
                key={block.key}
                tex={block.tex}
                displayMode={block.displayMode}
                maxWidth={maxMessageWidth}
              />
            ) : block.kind === 'para' ? (
              <MathParagraphView
                key={block.key}
                raw={block.raw}
                maxWidth={maxMessageWidth}
              />
            ) : (
              <RenderHTMLSource
                key={block.key}
                source={block.source}
                contentWidth={maxMessageWidth}
              />
            ),
          )}
      </View>
    );
  },
  (prevProps, nextProps) =>
    prevProps.markdownText === nextProps.markdownText &&
    prevProps.maxMessageWidth === nextProps.maxMessageWidth &&
    prevProps.selectable === nextProps.selectable,
);
