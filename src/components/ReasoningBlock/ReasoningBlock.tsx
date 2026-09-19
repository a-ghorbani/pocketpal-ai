import React from 'react';

import {MarkdownView} from '../MarkdownView';
import {ThinkingBubble} from '../ThinkingBubble';

interface ReasoningBlockProps {
  text: string;
  maxWidth: number;
  /** See ThinkingBubble: stream completion can collapse this block. */
  autoCollapse?: boolean;
  /** Whether a persisted chat preference starts this block collapsed. */
  initiallyCollapsed?: boolean;
  renderMarkdown?: boolean;
  renderLatex?: boolean;
  renderTables?: boolean;
}

const isEmpty = (text: string): boolean => !text || text.trim() === '';

/**
 * Renders native agent reasoning through the same constrained rich-content
 * pipeline as assistant text. AgentStep reasoning is structured separately
 * from content, so it must not rely on tag-based thinking detection.
 */
export const ReasoningBlock: React.FC<ReasoningBlockProps> = React.memo(
  ({
    text,
    maxWidth,
    autoCollapse,
    initiallyCollapsed,
    renderMarkdown = true,
    renderLatex = true,
    renderTables = true,
  }) => {
    if (isEmpty(text)) {
      return null;
    }

    return (
      <ThinkingBubble
        autoCollapse={autoCollapse}
        initiallyCollapsed={initiallyCollapsed}>
        <MarkdownView
          markdownText={text}
          maxMessageWidth={maxWidth}
          renderMarkdown={renderMarkdown}
          renderLatex={renderLatex}
          renderTables={renderTables}
        />
      </ThinkingBubble>
    );
  },
  (prev, next) =>
    prev.text === next.text &&
    prev.maxWidth === next.maxWidth &&
    prev.autoCollapse === next.autoCollapse &&
    prev.initiallyCollapsed === next.initiallyCollapsed &&
    prev.renderMarkdown === next.renderMarkdown &&
    prev.renderLatex === next.renderLatex &&
    prev.renderTables === next.renderTables,
);
