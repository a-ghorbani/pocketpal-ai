import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const createStyles = ({theme}: {theme: Theme}) =>
  StyleSheet.create({
    row: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 10,
    },
    rowHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    rowText: {
      flex: 1,
      gap: 2,
    },
    detail: {
      color: theme.colors.onSurfaceVariant,
    },
    installed: {
      color: theme.colors.statusLoaded,
    },
    error: {
      color: theme.colors.error,
    },
  });
