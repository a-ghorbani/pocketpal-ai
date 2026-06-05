import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    list: {
      flex: 1,
    },
    centered: {
      alignItems: 'center',
      paddingVertical: 24,
      paddingHorizontal: 24,
      gap: 16,
    },
    repoId: {
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
    },
    errorText: {
      fontSize: 14,
      color: theme.colors.error,
      textAlign: 'center',
    },
    errorActions: {
      flexDirection: 'row',
      gap: 8,
    },
  });
