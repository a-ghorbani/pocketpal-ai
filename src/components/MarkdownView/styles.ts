import type {MarkdownStyle} from 'react-native-enriched-markdown';

import {Theme} from '../../utils/types';

export type MarkdownVariant = 'body' | 'reasoning';

const BLOCK_GAP = 8;
const blockSpacing = {marginTop: 0, marginBottom: BLOCK_GAP};

const heading = (fontSize: number, lineHeight: number) => ({
  fontSize,
  lineHeight,
  fontWeight: 'bold',
  marginTop: 4,
  marginBottom: 4,
});

export const createMarkdownStyle = (
  theme: Theme,
  variant: MarkdownVariant,
): MarkdownStyle => {
  const {colors} = theme;
  const isReasoning = variant === 'reasoning';
  const text = isReasoning ? colors.thinkingBubbleText : colors.text;
  const textBlock = isReasoning
    ? {color: text, fontSize: 14, lineHeight: 20, ...blockSpacing}
    : {color: text, fontSize: 16, lineHeight: 22, ...blockSpacing};

  return {
    paragraph: textBlock,
    h1: {...heading(22, 28), color: text},
    h2: {...heading(20, 26), color: text},
    h3: {...heading(18, 24), color: text},
    h4: {...heading(17, 22), color: text},
    h5: {...heading(16, 22), color: text},
    h6: {...heading(16, 22), color: text},
    list: {
      ...textBlock,
      marginLeft: 16,
      gapWidth: 6,
      itemSpacing: 0,
      bulletColor: text,
      markerColor: text,
    },
    blockquote: {
      ...textBlock,
      borderWidth: 2,
      gapWidth: 8,
      padding: 4,
      borderColor: colors.outline,
      backgroundColor: colors.surfaceContainerHigh,
    },
    codeBlock: blockSpacing,
    link: {color: colors.secondary, underline: true},
    code: {
      color: colors.onSurface,
      backgroundColor: colors.surface,
      borderColor: colors.outline,
    },
    strikethrough: {color: text},
    underline: {color: text},
    thematicBreak: {
      color: colors.outline,
      height: 1,
      marginTop: 12,
      marginBottom: 12,
    },
    table: {
      ...blockSpacing,
      color: text,
      headerBackgroundColor: colors.surfaceContainerHigh,
      headerTextColor: text,
      rowEvenBackgroundColor: 'transparent',
      rowOddBackgroundColor: 'transparent',
      borderColor: colors.outline,
      cellPaddingHorizontal: 8,
      cellPaddingVertical: 6,
    },
    taskList: {
      borderColor: text,
      checkedTextColor: text,
    },
    spoiler: {color: colors.surfaceContainerHigh},
  };
};
