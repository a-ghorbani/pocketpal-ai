import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const styles = ({theme}: {theme: Theme}) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingBottom: 12,
    },
    timing: {
      color: theme.colors.textSecondary,
      fontSize: 10,
    },
    icon: {
      marginRight: 5,
      color: theme.colors.textSecondary,
      fontSize: 16,
    },
  });
