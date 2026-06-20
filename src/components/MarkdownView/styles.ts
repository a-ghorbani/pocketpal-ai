import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

// Plain object (not via StyleSheet.create) because react-syntax-highlighter's
// customStyle is merged with Object.assign — a numeric StyleSheet id won't
// flatten the upstream white PreTag fallback. See MarkdownView for the why.
export const codeHighlighterPreOverride = {
  backgroundColor: 'transparent',
} as const;

export const createTagsStyles = (theme: Theme) => ({
  body: {
    ...theme.typography.bodyM,
    color: theme.colors.foregroundPrimary,
    padding: 0,
    paddingTop: 0,
    margin: 0,
    backgroundColor: 'transparent',
  },
  code: {
    ...theme.typography.codeS,
    backgroundColor: theme.colors.surface,
    padding: 4,
    borderRadius: 4,
    color: theme.colors.onSurface,
    whiteSpace: 'pre' as const,
  },
  pre: {
    ...theme.typography.codeM,
    backgroundColor: theme.colors.surface,
    padding: 8,
    borderRadius: 6,
    marginVertical: 8,
    color: theme.colors.onPrimaryContainer,
    whiteSpace: 'pre' as const,
  },
  // Styles for thinking tags
  thinking: {
    ...theme.typography.bodyS,
    color: theme.colors.thinkingBubbleText,
  },
  think: {
    ...theme.typography.bodyS,
    color: theme.colors.thinkingBubbleText,
  },
  thought: {
    ...theme.typography.bodyS,
    color: theme.colors.thinkingBubbleText,
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
      fontFamily: theme.typography.codeM.fontFamily,
    },
    codeHighlighterScrollContent: {
      backgroundColor: theme.colors.surface,
      padding: 8,
      borderRadius: 6,
      marginTop: 4,
    },
  });
