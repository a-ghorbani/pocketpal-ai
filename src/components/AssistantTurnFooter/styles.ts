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
    copyButton: {
      minWidth: 44,
      minHeight: 44,
      marginVertical: -14,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    textGroup: {
      flexShrink: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: 5,
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
