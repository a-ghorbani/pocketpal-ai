import {StyleSheet, type TextStyle, type ViewStyle} from 'react-native';

import type {Theme} from '../../../utils/types';

export type LabelVariant =
  | 'informational'
  | 'status-success'
  | 'status-warning'
  | 'status-error'
  | 'status-info';
export type LabelSize = 's' | 'm';

export type LabelStyleArgs = {
  variant: LabelVariant;
  size: LabelSize;
};

const variantTokens = (theme: Theme, variant: LabelVariant) => {
  switch (variant) {
    case 'status-success':
      return {
        background: theme.colors.secondaryContainer,
        foreground: theme.colors.onSecondaryContainer,
      };
    case 'status-warning':
      return {
        background: theme.colors.tertiaryContainer,
        foreground: theme.colors.onTertiaryContainer,
      };
    case 'status-error':
      return {
        background: theme.colors.errorContainer,
        foreground: theme.colors.onErrorContainer,
      };
    case 'status-info':
      return {
        background: theme.colors.primaryContainer,
        foreground: theme.colors.onPrimaryContainer,
      };
    case 'informational':
    default:
      return {
        background: theme.colors.surfaceContainer,
        foreground: theme.colors.onSurface,
      };
  }
};

export const createStyles = (theme: Theme, {variant, size}: LabelStyleArgs) => {
  const v = variantTokens(theme, variant);
  const labelStyle =
    size === 's' ? theme.typography.captionS : theme.typography.captionM;
  const root: ViewStyle = {
    paddingHorizontal: size === 's' ? theme.spacing.xs : theme.spacing.s,
    paddingVertical: theme.spacing.xxs,
    borderRadius: theme.radius.xs,
    backgroundColor: v.background,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: theme.spacing.xxs,
  };
  const label: TextStyle = {
    ...labelStyle,
    color: v.foreground,
  };
  return StyleSheet.create({root, label});
};
