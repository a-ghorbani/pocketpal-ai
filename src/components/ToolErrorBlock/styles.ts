import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const styles = ({theme}: {theme: Theme}) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    icon: {
      fontSize: 14,
      marginRight: 6,
      color: theme.colors.error,
    },
    label: {
      fontSize: 12,
      color: theme.colors.error,
    },
    message: {
      fontSize: 11,
      marginTop: 2,
      marginLeft: 20,
      color: theme.colors.onSurfaceVariant,
    },
  });
