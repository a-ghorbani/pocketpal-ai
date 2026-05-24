import {StyleSheet, type TextStyle, type ViewStyle} from 'react-native';

import type {Theme} from '../../../utils/types';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'destructive';
export type ButtonSize = 's' | 'm' | 'l';

export type ButtonStyleArgs = {
  variant: ButtonVariant;
  size: ButtonSize;
  disabled?: boolean;
};

const sizeTokens = (theme: Theme, size: ButtonSize) => {
  switch (size) {
    case 's':
      return {
        paddingHorizontal: theme.spacing.m,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.s,
        labelStyle: theme.typography.uiS,
      };
    case 'l':
      return {
        paddingHorizontal: theme.spacing.l,
        paddingVertical: theme.spacing.s,
        borderRadius: theme.radius.m,
        labelStyle: theme.typography.uiM,
      };
    case 'm':
    default:
      return {
        paddingHorizontal: theme.spacing.m,
        paddingVertical: theme.spacing.s,
        borderRadius: theme.radius.s,
        labelStyle: theme.typography.uiM,
      };
  }
};

const variantTokens = (
  theme: Theme,
  variant: ButtonVariant,
): {background: string; foreground: string; border?: string} => {
  switch (variant) {
    case 'primary':
      return {
        background: theme.colors.primary,
        foreground: theme.colors.onPrimary,
      };
    case 'secondary':
      return {
        background: theme.colors.secondaryContainer,
        foreground: theme.colors.onSecondaryContainer,
      };
    case 'tertiary':
      return {
        background: 'transparent',
        foreground: theme.colors.primary,
      };
    case 'destructive':
      return {
        background: theme.colors.error,
        foreground: theme.colors.onError,
      };
  }
};

export const createStyles = (
  theme: Theme,
  {variant, size, disabled}: ButtonStyleArgs,
) => {
  const s = sizeTokens(theme, size);
  const v = disabled
    ? {
        background: theme.colors.surfaceContainerLow,
        foreground: theme.colors.onSurfaceVariant,
      }
    : variantTokens(theme, variant);
  const root: ViewStyle = {
    paddingHorizontal: s.paddingHorizontal,
    paddingVertical: s.paddingVertical,
    borderRadius: s.borderRadius,
    backgroundColor: v.background,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  };
  const label: TextStyle = {
    ...s.labelStyle,
    color: v.foreground,
  };
  return StyleSheet.create({root, label});
};
