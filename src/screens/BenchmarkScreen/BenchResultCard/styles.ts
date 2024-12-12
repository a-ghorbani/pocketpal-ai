import {StyleSheet} from 'react-native';
import type {Theme} from '../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    resultCard: {
      marginVertical: 8,
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.surfaceVariant,
    },
    configLabel: {
      color: theme.colors.primary,
      marginBottom: 8,
      fontSize: 12,
      letterSpacing: 0.5,
    },
    resultHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 16,
    },
    headerLeft: {
      flex: 1,
      marginRight: 16,
    },
    modelDesc: {
      color: theme.colors.primary,
      marginBottom: 4,
    },
    modelInfo: {
      color: theme.colors.onSurfaceVariant,
    },
    benchmarkParams: {
      marginBottom: 16,
    },
    benchmarkResults: {
      backgroundColor: theme.colors.surfaceVariant,
      borderRadius: 8,
      padding: 12,
      marginBottom: 12,
    },
    paramRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 4,
      backgroundColor: theme.colors.surfaceVariant,
      borderRadius: 8,
      padding: 12,
    },
    paramLabel: {
      flex: 1,
      color: theme.colors.onSurfaceVariant,
    },
    timestamp: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 11,
      textAlign: 'right',
    },
    resultRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    resultValue: {
      color: theme.colors.onSurface,
    },
    resultLabel: {
      color: theme.colors.onSurfaceVariant,
    },
    chipContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 16,
    },
    chip: {
      backgroundColor: theme.colors.primaryContainer,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
    },
    chipText: {
      color: theme.colors.onPrimaryContainer,
      fontSize: 12,
    },
    deleteButton: {
      marginTop: -8,
      marginRight: -8,
    },
  });