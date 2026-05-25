import {StyleSheet, type TextStyle, type ViewStyle} from 'react-native';

import type {Theme} from '../../../utils/types';

export type BottomNavBarVariant = 'default';
export type BottomNavBarSize = 'm';

export type BottomNavBarStyleArgs = {
  selected?: boolean;
};

export const createStyles = (theme: Theme, {selected}: BottomNavBarStyleArgs) =>
  StyleSheet.create({
    root: {
      flexDirection: 'row',
      alignItems: 'stretch',
      paddingVertical: theme.spacing.xs,
      backgroundColor: theme.colors.surface,
      borderTopWidth: theme.stroke.xs,
      borderTopColor: theme.colors.outlineVariant,
    } as ViewStyle,
    item: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: theme.spacing.xs,
      gap: theme.spacing.xxs,
    } as ViewStyle,
    label: {
      ...theme.typography.captionS,
      color: selected ? theme.colors.primary : theme.colors.onSurfaceVariant,
    } as TextStyle,
  });
