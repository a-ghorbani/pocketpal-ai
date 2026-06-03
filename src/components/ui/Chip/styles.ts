import {StyleSheet, type TextStyle, type ViewStyle} from 'react-native';

import type {Theme} from '../../../utils/types';

export type ChipVariant = 'display' | 'selectable' | 'input';
export type ChipSize = 's' | 'm';

export type ChipStyleArgs = {
  variant: ChipVariant;
  size: ChipSize;
  selected?: boolean;
  disabled?: boolean;
};

const sizeTokens = (theme: Theme, size: ChipSize) => {
  if (size === 's') {
    return {
      paddingHorizontal: theme.spacing.s,
      paddingVertical: theme.spacing.xxs,
      borderRadius: theme.radius.xs,
      labelStyle: theme.typography.captionS,
      gap: theme.spacing.xxs,
    };
  }
  return {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.s,
    labelStyle: theme.typography.captionM,
    gap: theme.spacing.xs,
  };
};

const variantTokens = (
  theme: Theme,
  variant: ChipVariant,
  selected: boolean,
  disabled: boolean,
) => {
  if (disabled) {
    return {
      background: theme.colors.surfaceContainerLow,
      foreground: theme.colors.onSurfaceVariant,
    };
  }
  if (variant === 'selectable' && selected) {
    return {
      background: theme.colors.secondaryContainer,
      foreground: theme.colors.onSecondaryContainer,
    };
  }
  if (variant === 'input') {
    return {
      background: theme.colors.surfaceContainerHigh,
      foreground: theme.colors.onSurface,
    };
  }
  return {
    background: theme.colors.surfaceContainer,
    foreground: theme.colors.onSurface,
  };
};

export const createStyles = (
  theme: Theme,
  {variant, size, selected, disabled}: ChipStyleArgs,
) => {
  const s = sizeTokens(theme, size);
  const v = variantTokens(theme, variant, !!selected, !!disabled);
  const root: ViewStyle = {
    paddingHorizontal: s.paddingHorizontal,
    paddingVertical: s.paddingVertical,
    borderRadius: s.borderRadius,
    backgroundColor: v.background,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: s.gap,
  };
  const label: TextStyle = {
    ...s.labelStyle,
    color: v.foreground,
  };
  return StyleSheet.create({root, label});
};
