import {StyleSheet, type TextStyle, type ViewStyle} from 'react-native';

import type {Theme} from '../../../utils/types';

export type TabsVariant = 'underline' | 'pill';
export type TabsSize = 's' | 'm';

export type TabsStyleArgs = {
  variant: TabsVariant;
  size: TabsSize;
  selected?: boolean;
  disabled?: boolean;
};

const sizeTokens = (theme: Theme, size: TabsSize) => {
  if (size === 's') {
    return {
      paddingHorizontal: theme.spacing.s,
      paddingVertical: theme.spacing.xs,
      labelStyle: theme.typography.uiS,
    };
  }
  return {
    paddingHorizontal: theme.spacing.m,
    paddingVertical: theme.spacing.s,
    labelStyle: theme.typography.uiM,
  };
};

export const createStyles = (
  theme: Theme,
  {variant, size, selected, disabled}: TabsStyleArgs,
) => {
  const s = sizeTokens(theme, size);
  const item: ViewStyle = {
    paddingHorizontal: s.paddingHorizontal,
    paddingVertical: s.paddingVertical,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  };
  if (variant === 'pill') {
    item.borderRadius = theme.radius.l;
    item.backgroundColor = selected
      ? theme.colors.secondaryContainer
      : 'transparent';
  }
  const label: TextStyle = {
    ...s.labelStyle,
    color: disabled
      ? theme.colors.onSurfaceVariant
      : selected
        ? theme.colors.primary
        : theme.colors.onSurfaceVariant,
  };
  const underline: ViewStyle = {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: theme.stroke.md,
    backgroundColor:
      variant === 'underline' && selected
        ? theme.colors.primary
        : 'transparent',
  };
  return StyleSheet.create({
    root: {flexDirection: 'row', alignItems: 'stretch'},
    item,
    label,
    underline,
  });
};
