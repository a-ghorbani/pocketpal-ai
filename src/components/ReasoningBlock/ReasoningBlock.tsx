import React from 'react';

import {ThinkingBubble} from '../ThinkingBubble';
import {MarkdownView} from '../MarkdownView';

interface ReasoningBlockProps {
  text: string;
  maxWidth: number;
  /**
   * When true, the inner ThinkingBubble auto-collapses to its compact
   * text-only row. The user's manual toggle still wins for the bubble's
   * lifetime — see ThinkingBubble's `userToggledRef`.
   */
  autoCollapse?: boolean;
}

const isEmpty = (s: string) => !s || s.trim() === '';

export const ReasoningBlock: React.FC<ReasoningBlockProps> = React.memo(
  ({text, maxWidth, autoCollapse}) => {
    if (isEmpty(text)) {
      return null;
    }

    return (
      <ThinkingBubble autoCollapse={autoCollapse}>
        <MarkdownView
          markdownText={text}
          maxMessageWidth={maxWidth}
          selectable={false}
          variant="reasoning"
        />
      </ThinkingBubble>
    );
  },
  (prev, next) =>
    prev.text === next.text &&
    prev.maxWidth === next.maxWidth &&
    prev.autoCollapse === next.autoCollapse,
);
