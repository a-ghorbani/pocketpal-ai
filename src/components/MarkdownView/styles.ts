import type {MarkdownStyle} from 'react-native-enriched-markdown';

import {Theme} from '../../utils/types';

export type MarkdownVariant = 'body' | 'reasoning';

export const createMarkdownStyle = (
  theme: Theme,
  variant: MarkdownVariant,
): MarkdownStyle => {
  const {colors} = theme;
  const isReasoning = variant === 'reasoning';
  const text = isReasoning ? colors.thinkingBubbleText : colors.text;
  const textBlock = isReasoning
    ? {color: text, fontSize: 14, lineHeight: 20}
    : {color: text, fontSize: 16};
  const heading = {color: text};

  return {
    paragraph: textBlock,
    h1: heading,
    h2: heading,
    h3: heading,
    h4: heading,
    h5: heading,
    h6: heading,
    list: {
      ...textBlock,
      bulletColor: colors.textSecondary,
      markerColor: colors.textSecondary,
    },
    blockquote: {
      ...textBlock,
      color: colors.textSecondary,
      borderColor: colors.outline,
      backgroundColor: colors.surfaceContainerHigh,
    },
    link: {color: colors.secondary, underline: true},
    code: {
      color: colors.onSurface,
      backgroundColor: colors.surface,
      borderColor: colors.outline,
    },
    strikethrough: {color: colors.textSecondary},
    underline: {color: text},
    thematicBreak: {color: colors.outline},
    table: {
      color: text,
      headerBackgroundColor: colors.surfaceContainerHigh,
      headerTextColor: text,
      rowEvenBackgroundColor: 'transparent',
      rowOddBackgroundColor: 'transparent',
      borderColor: colors.outline,
    },
    taskList: {
      borderColor: colors.textSecondary,
      checkedTextColor: colors.textSecondary,
    },
    spoiler: {color: colors.surfaceContainerHigh},
  };
};
