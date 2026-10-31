import {StyleSheet, type ViewStyle} from 'react-native';

import type {Theme} from '../../../utils/types';

export type CardVariant = 'flat' | 'elevated' | 'outlined';
export type CardSize = 's' | 'm' | 'l';

export type CardStyleArgs = {
  variant: CardVariant;
  size: CardSize;
};

const sizePadding = (theme: Theme, size: CardSize) => {
  switch (size) {
    case 's':
      return theme.spacing.s;
    case 'l':
      return theme.spacing.l;
    case 'm':
    default:
      return theme.spacing.m;
  }
};

export const createStyles = (theme: Theme, {variant, size}: CardStyleArgs) => {
  const padding = sizePadding(theme, size);
  const root: ViewStyle = {
    padding,
    borderRadius: theme.radius.m,
    backgroundColor: theme.colors.surface,
    ...(variant === 'elevated' ? {elevation: 1} : {}),
    ...(variant === 'outlined'
      ? {borderWidth: theme.stroke.sm, borderColor: theme.colors.outline}
      : {}),
  };
  return StyleSheet.create({
    root,
    listRoot: {
      padding,
      borderRadius: theme.radius.m,
      backgroundColor: theme.colors.surface,
    },
  });
};
