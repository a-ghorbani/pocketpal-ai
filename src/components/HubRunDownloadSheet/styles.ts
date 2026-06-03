import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      padding: 16,
      paddingBottom: 32,
      gap: 16,
    },
    headerText: {
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
    },
    detailRow: {
      gap: 4,
    },
    detailLabel: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
    },
    detailValue: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.onSurface,
    },
    centered: {
      alignItems: 'center',
      paddingVertical: 24,
      gap: 12,
    },
    errorText: {
      fontSize: 14,
      color: theme.colors.error,
      textAlign: 'center',
    },
    actionsContainer: {
      flexDirection: 'row',
      paddingHorizontal: 24,
    },
  });
