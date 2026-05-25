import {StyleSheet, type TextStyle, type ViewStyle} from 'react-native';

import type {Theme} from '../../../utils/types';

/**
 * CategoryBadge palette — small token-bound palette covering the common
 * badge color slots.
 */
export type CategoryBadgeVariant =
  | 'neutral'
  | 'primary'
  | 'secondary'
  | 'tertiary';
export type CategoryBadgeSize = 's' | 'm';

export type CategoryBadgeStyleArgs = {
  variant: CategoryBadgeVariant;
  size: CategoryBadgeSize;
};

const variantTokens = (theme: Theme, variant: CategoryBadgeVariant) => {
  switch (variant) {
    case 'primary':
      return {
        background: theme.colors.primaryContainer,
        foreground: theme.colors.onPrimaryContainer,
      };
    case 'secondary':
      return {
        background: theme.colors.secondaryContainer,
        foreground: theme.colors.onSecondaryContainer,
      };
    case 'tertiary':
      return {
        background: theme.colors.tertiaryContainer,
        foreground: theme.colors.onTertiaryContainer,
      };
    case 'neutral':
    default:
      return {
        background: theme.colors.surfaceContainer,
        foreground: theme.colors.onSurface,
      };
  }
};

export const createStyles = (
  theme: Theme,
  {variant, size}: CategoryBadgeStyleArgs,
) => {
  const v = variantTokens(theme, variant);
  const labelStyle =
    size === 's' ? theme.typography.captionS : theme.typography.captionM;
  const root: ViewStyle = {
    paddingHorizontal: size === 's' ? theme.spacing.xs : theme.spacing.s,
    paddingVertical: theme.spacing.xxs,
    borderRadius: theme.radius.xxs,
    backgroundColor: v.background,
    alignSelf: 'flex-start',
  };
  const label: TextStyle = {
    ...labelStyle,
    color: v.foreground,
  };
  return StyleSheet.create({root, label});
};
