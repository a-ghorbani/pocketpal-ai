import {StyleSheet, type TextStyle, type ViewStyle} from 'react-native';

import type {Theme} from '../../../utils/types';

export type DropdownSize = 's' | 'm' | 'l';

export type DropdownStyleArgs = {
  size: DropdownSize;
  disabled?: boolean;
};

const sizeTokens = (theme: Theme, size: DropdownSize) => {
  switch (size) {
    case 's':
      return {
        paddingHorizontal: theme.spacing.s,
        paddingVertical: theme.spacing.xs,
        labelStyle: theme.typography.uiS,
      };
    case 'l':
      return {
        paddingHorizontal: theme.spacing.m,
        paddingVertical: theme.spacing.s,
        labelStyle: theme.typography.uiM,
      };
    case 'm':
    default:
      return {
        paddingHorizontal: theme.spacing.s,
        paddingVertical: theme.spacing.xs,
        labelStyle: theme.typography.uiM,
      };
  }
};

export const createStyles = (
  theme: Theme,
  {size, disabled}: DropdownStyleArgs,
) => {
  const s = sizeTokens(theme, size);
  const trigger: ViewStyle = {
    paddingHorizontal: s.paddingHorizontal,
    paddingVertical: s.paddingVertical,
    borderRadius: theme.radius.s,
    backgroundColor: disabled
      ? theme.colors.surfaceContainerLow
      : theme.colors.surfaceContainer,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    alignSelf: 'flex-start',
  };
  const label: TextStyle = {
    ...s.labelStyle,
    color: disabled ? theme.colors.onSurfaceVariant : theme.colors.onSurface,
  };
  return StyleSheet.create({trigger, label});
};
