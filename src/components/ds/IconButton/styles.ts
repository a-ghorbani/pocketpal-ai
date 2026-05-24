import {StyleSheet, type ViewStyle} from 'react-native';

import type {Theme} from '../../../utils/types';

export type IconButtonVariant = 'standard' | 'filled' | 'outlined';
export type IconButtonSize = 's' | 'm' | 'l';

export type IconButtonStyleArgs = {
  variant: IconButtonVariant;
  size: IconButtonSize;
  disabled?: boolean;
};

const sizeTokens = (theme: Theme, size: IconButtonSize) => {
  switch (size) {
    case 's':
      return {padding: theme.spacing.xs, borderRadius: theme.radius.s};
    case 'l':
      return {padding: theme.spacing.s, borderRadius: theme.radius.m};
    case 'm':
    default:
      return {padding: theme.spacing.xs, borderRadius: theme.radius.s};
  }
};

const variantTokens = (
  theme: Theme,
  variant: IconButtonVariant,
): {background: string; border?: string} => {
  switch (variant) {
    case 'standard':
      return {background: 'transparent'};
    case 'filled':
      return {background: theme.colors.primaryContainer};
    case 'outlined':
      return {
        background: 'transparent',
        border: theme.colors.outline,
      };
  }
};

export const createStyles = (
  theme: Theme,
  {variant, size, disabled}: IconButtonStyleArgs,
) => {
  const s = sizeTokens(theme, size);
  const v = disabled
    ? {background: theme.colors.surfaceContainerLow, border: undefined}
    : variantTokens(theme, variant);
  const root: ViewStyle = {
    padding: s.padding,
    borderRadius: s.borderRadius,
    backgroundColor: v.background,
    alignItems: 'center',
    justifyContent: 'center',
    ...(v.border
      ? {borderWidth: theme.stroke.sm, borderColor: v.border}
      : {}),
  };
  return StyleSheet.create({root});
};
