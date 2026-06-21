import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.s,
      paddingHorizontal: theme.spacing.m,
      paddingTop: theme.spacing.s,
      paddingBottom: theme.spacing.s,
    },
    backButton: {
      padding: theme.spacing.xs,
      marginStart: -theme.spacing.xs,
    },
    title: {
      flex: 1,
      ...theme.typography.headlineH1,
      color: theme.colors.foregroundPrimary,
    },
    createAction: {
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.xs,
    },
    createActionLabel: {
      ...theme.typography.uiM,
      color: theme.colors.foregroundPrimary,
    },
    tabs: {
      marginHorizontal: theme.spacing.m,
      marginBottom: theme.spacing.s,
    },
    listContainer: {
      paddingHorizontal: theme.spacing.m,
      paddingBottom: theme.spacing.xl,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: theme.spacing.xxl,
      paddingHorizontal: theme.spacing.xl,
    },
    emptyStateText: {
      ...theme.typography.bodyM,
      color: theme.colors.foregroundTertiary,
      textAlign: 'center',
    },
  });
