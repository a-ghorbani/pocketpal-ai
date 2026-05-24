import {StyleSheet} from 'react-native';

import type {Theme} from '../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.m,
      paddingVertical: theme.spacing.s,
      backgroundColor: theme.colors.surface,
    },
    rootCenter: {
      justifyContent: 'space-between',
    },
    leadingSlot: {
      marginRight: theme.spacing.s,
    },
    trailingSlot: {
      marginLeft: theme.spacing.s,
    },
    titleColumn: {
      flex: 1,
    },
    titleColumnCenter: {
      flex: 1,
      alignItems: 'center',
    },
    title: {
      ...theme.typography.titleM,
      color: theme.colors.onSurface,
    },
    subtitle: {
      ...theme.typography.captionS,
      color: theme.colors.onSurfaceVariant,
      marginTop: theme.spacing.xxs,
    },
  });
