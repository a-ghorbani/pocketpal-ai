import {StyleSheet} from 'react-native';

import type {MarkdownStyle} from 'react-native-enriched-markdown';

import {Theme} from '../../utils/types';

// Plain object (not via StyleSheet.create) because react-syntax-highlighter's
// customStyle is merged with Object.assign — a numeric StyleSheet id won't
// flatten the upstream white PreTag fallback. See MarkdownView for the why.
export const codeHighlighterPreOverride = {
  backgroundColor: 'transparent',
} as const;

export const createTagsStyles = (theme: Theme) => ({
  body: {
    color: theme.colors.text,
    fontSize: 16,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    padding: 0,
    paddingTop: 0,
    margin: 0,
    backgroundColor: 'transparent',
    // display: 'inline-block',
  },
  a: {
    color: theme.colors.secondary,
    textDecorationLine: 'underline' as const,
  },
  code: {
    fontFamily: 'Courier', // Change the font for code snippets
    backgroundColor: theme.colors.surface, // Custom background for code blocks
    padding: 4,
    borderRadius: 4,
    color: theme.colors.onSurface, // Color for code text
    fontSize: 12,
    whiteSpace: 'pre' as const,
  },
  pre: {
    backgroundColor: theme.colors.surface, // Background for pre blocks
    padding: 8,
    borderRadius: 6,
    marginVertical: 8,
    color: theme.colors.onPrimaryContainer,
    fontFamily: 'Courier',
    fontSize: 14,
    whiteSpace: 'pre' as const,
  },
  // Styles for thinking tags
  thinking: {
    color: theme.colors.thinkingBubbleText,
    fontSize: 14,
    lineHeight: 20,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  think: {
    color: theme.colors.thinkingBubbleText,
    fontSize: 14,
    lineHeight: 20,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  thought: {
    color: theme.colors.thinkingBubbleText,
    fontSize: 14,
    lineHeight: 20,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
});

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    markdownContainer: {
      // Dynamic maxWidth will be applied via style prop
    },
    codeHighlighterText: {
      fontFamily: 'Courier',
    },
    codeHighlighterScrollContent: {
      backgroundColor: theme.colors.surface,
      padding: 8,
      borderRadius: 6,
      marginTop: 4,
    },
  });

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
