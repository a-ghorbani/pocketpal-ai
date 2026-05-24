import {StyleSheet, type TextStyle, type ViewStyle} from 'react-native';

import type {Theme} from '../../../utils/types';

export type MessageContentVariant = 'user' | 'assistant' | 'system';

const variantTokens = (theme: Theme, variant: MessageContentVariant) => {
  switch (variant) {
    case 'user':
      return {
        background: theme.colors.primaryContainer,
        foreground: theme.colors.onPrimaryContainer,
        alignSelf: 'flex-end' as const,
      };
    case 'system':
      return {
        background: theme.colors.surfaceContainerLow,
        foreground: theme.colors.onSurfaceVariant,
        alignSelf: 'center' as const,
      };
    case 'assistant':
    default:
      return {
        background: theme.colors.surfaceContainer,
        foreground: theme.colors.onSurface,
        alignSelf: 'flex-start' as const,
      };
  }
};

export const createStyles = (
  theme: Theme,
  variant: MessageContentVariant,
) => {
  const v = variantTokens(theme, variant);
  const root: ViewStyle = {
    paddingHorizontal: theme.spacing.m,
    paddingVertical: theme.spacing.s,
    borderRadius: theme.radius.ml,
    backgroundColor: v.background,
    alignSelf: v.alignSelf,
    maxWidth: '85%',
  };
  const body: TextStyle = {
    ...theme.typography.bodyM,
    color: v.foreground,
  };
  return StyleSheet.create({root, body});
};
