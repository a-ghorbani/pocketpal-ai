import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    sheetScrollViewContainer: {
      padding: theme.spacing.m,
    },
    secondaryButtons: {
      flexDirection: 'row',
      gap: theme.spacing.s,
    },
    multimodalDivider: {
      marginVertical: theme.spacing.m,
    },
    multimodalSectionTitle: {
      ...theme.typography.titleM,
      color: theme.colors.onSurface,
      marginBottom: theme.spacing.sm,
    },
  });
