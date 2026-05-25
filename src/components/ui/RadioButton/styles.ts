import {StyleSheet, type TextStyle, type ViewStyle} from 'react-native';

import type {Theme} from '../../../utils/types';

export type RadioButtonSize = 's' | 'm' | 'l';

export type RadioButtonStyleArgs = {
  size: RadioButtonSize;
};

export const createStyles = (theme: Theme, _args: RadioButtonStyleArgs) =>
  StyleSheet.create({
    root: {
      flexDirection: 'row',
      alignItems: 'center',
    } as ViewStyle,
    sectionRoot: {
      gap: theme.spacing.xs,
    } as ViewStyle,
    sectionLabel: {
      ...theme.typography.titleS,
      color: theme.colors.onSurface,
      marginBottom: theme.spacing.xxs,
    } as TextStyle,
    sectionHelper: {
      ...theme.typography.captionS,
      color: theme.colors.onSurfaceVariant,
      marginBottom: theme.spacing.s,
    } as TextStyle,
  });
