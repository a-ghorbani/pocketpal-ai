import {StyleSheet, type TextStyle, type ViewStyle} from 'react-native';

import type {Theme} from '../../../utils/types';

export type BottomNavBarVariant = 'default' | 'floating';
export type BottomNavBarSize = 'm';

export type BottomNavBarStyleArgs = {
  variant?: BottomNavBarVariant;
  selected?: boolean;
};

const createDefaultStyles = (theme: Theme, selected?: boolean) =>
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

const createFloatingStyles = (theme: Theme, selected?: boolean) =>
  StyleSheet.create({
    root: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'center',
      padding: theme.spacing.xs,
      gap: theme.spacing.xxs,
      borderRadius: theme.radius.xxl,
      backgroundColor: theme.colors.surface,
      shadowColor: theme.colors.shadow,
      shadowOffset: {width: 0, height: 4},
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 8,
    } as ViewStyle,
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: theme.spacing.s,
      paddingHorizontal: theme.spacing.sm,
      gap: theme.spacing.xs,
      borderRadius: theme.radius.xxl,
      borderWidth: selected ? theme.stroke.xs : 0,
      borderColor: selected ? theme.colors.accent.yellowMute : undefined,
      backgroundColor: selected ? theme.colors.accent.yellowSubtle : undefined,
    } as ViewStyle,
    label: {
      ...theme.typography.captionS,
      color: selected ? theme.colors.onSurface : theme.colors.onSurfaceVariant,
    } as TextStyle,
  });

export const createStyles = (
  theme: Theme,
  {variant = 'default', selected}: BottomNavBarStyleArgs,
) =>
  variant === 'floating'
    ? createFloatingStyles(theme, selected)
    : createDefaultStyles(theme, selected);
