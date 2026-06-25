import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    sheetScrollViewContainer: {
      padding: theme.spacing.m,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.m,
      paddingBottom: theme.spacing.sm,
    },
    headerTitle: {
      ...theme.typography.titleM,
      color: theme.colors.onSurface,
      flex: 1,
      textAlign: 'center',
    },
    headerSide: {
      minWidth: 56,
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerSideEnd: {
      justifyContent: 'flex-end',
    },
    headerDivider: {
      marginBottom: theme.spacing.sm,
    },
    multimodalDivider: {
      marginVertical: theme.spacing.m,
    },
    multimodalSectionTitle: {
      ...theme.typography.titleM,
      color: theme.colors.onSurface,
      marginBottom: theme.spacing.sm,
    },
    reasoningRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: theme.spacing.sm,
    },
    reasoningHelp: {
      marginBottom: theme.spacing.sm,
      opacity: 0.7,
    },
    effortChipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.s,
      marginBottom: theme.spacing.sm,
    },
  });
