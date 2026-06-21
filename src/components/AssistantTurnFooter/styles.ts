import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const styles = ({theme}: {theme: Theme}) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingBottom: 12,
      gap: 5,
    },
    timingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    timingChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    timing: {
      color: theme.colors.textSecondary,
      fontSize: 10,
    },
    interruptedStatus: {
      color: theme.colors.error,
      fontSize: 10,
    },
  });
