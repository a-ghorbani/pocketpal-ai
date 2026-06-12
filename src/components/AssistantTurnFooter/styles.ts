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
    timing: {
      color: theme.colors.textSecondary,
      fontSize: 10,
    },
    // FIX #755: Style for model name display
    modelName: {
      color: theme.colors.primary,
      fontSize: 10,
      fontWeight: '500',
    },
    interruptedStatus: {
      color: theme.colors.error,
      fontSize: 10,
    },
  });
