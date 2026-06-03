import {StyleSheet, type TextStyle, type ViewStyle} from 'react-native';

import type {Theme} from '../../../utils/types';

export type InputVariant = 'single' | 'multi';
export type InputSize = 's' | 'm' | 'l';

export type InputStyleArgs = {
  variant: InputVariant;
  size: InputSize;
  state: 'default' | 'focused' | 'disabled';
  hasError?: boolean;
};

const sizeTokens = (theme: Theme, size: InputSize) => {
  switch (size) {
    case 's':
      return {paddingVertical: theme.spacing.xxs};
    case 'l':
      return {paddingVertical: theme.spacing.s};
    case 'm':
    default:
      return {paddingVertical: theme.spacing.xs};
  }
};

export const createStyles = (
  theme: Theme,
  {variant, size, state, hasError}: InputStyleArgs,
) => {
  const s = sizeTokens(theme, size);
  const borderColor = hasError
    ? theme.colors.error
    : state === 'focused'
      ? theme.colors.primary
      : theme.colors.outline;
  const root: ViewStyle = {
    paddingHorizontal: theme.spacing.s,
    paddingVertical: s.paddingVertical,
    borderBottomWidth: theme.stroke.sm,
    borderBottomColor: borderColor,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: variant === 'multi' ? 'flex-start' : 'center',
    gap: theme.spacing.xs,
  };
  const input: TextStyle = {
    ...theme.typography.bodyM,
    color:
      state === 'disabled'
        ? theme.colors.onSurfaceVariant
        : theme.colors.onSurface,
    flex: 1,
    padding: 0,
    textAlignVertical: variant === 'multi' ? 'top' : 'auto',
  };
  const label: TextStyle = {
    ...theme.typography.captionS,
    color: theme.colors.onSurfaceVariant,
    marginBottom: theme.spacing.xxs,
  };
  const helper: TextStyle = {
    ...theme.typography.captionS,
    color: hasError ? theme.colors.error : theme.colors.onSurfaceVariant,
    marginTop: theme.spacing.xxs,
  };
  return StyleSheet.create({root, input, label, helper});
};
