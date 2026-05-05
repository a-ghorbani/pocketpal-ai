import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const styles = ({theme}: {theme: Theme}) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    icon: {
      fontSize: 14,
      marginRight: 6,
      color: theme.colors.onSurfaceVariant,
    },
    label: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
    },
  });
