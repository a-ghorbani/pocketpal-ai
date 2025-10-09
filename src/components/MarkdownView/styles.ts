import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

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
  code: {
    fontFamily: 'Courier', // Change the font for code snippets
    backgroundColor: theme.colors.surface, // Custom background for code blocks
    padding: 4,
    borderRadius: 4,
    color: theme.colors.onSurface, // Color for code text
    fontSize: 12,
  },
  pre: {
    backgroundColor: theme.colors.surface, // Background for pre blocks
    padding: 8,
    borderRadius: 6,
    color: theme.colors.onPrimaryContainer,
    fontFamily: 'Courier',
    fontSize: 14,
    // overflow: 'scroll', // Ensure scrolling for long code blocks
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
    thinkContainer: {
      backgroundColor: theme.colors.surfaceContainerHigh,
      borderRadius: 8,
      padding: 12,
      marginVertical: 8,
      borderLeftWidth: 4,
      borderLeftColor: theme.colors.primary,
      opacity: 0.8,
    },
    thinkText: {
      color: theme.colors.primary,
      fontWeight: 'bold',
      marginRight: 8,
    },
    thinkTextContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 4,
    },
  });
