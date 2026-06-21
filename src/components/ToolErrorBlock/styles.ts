import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const styles = ({theme}: {theme: Theme}) =>
  StyleSheet.create({
    container: {
      paddingVertical: 4,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    icon: {
      fontSize: 14,
      marginRight: 6,
      color: theme.colors.redAccent,
    },
    label: {
      ...theme.typography.captionS,
      color: theme.colors.redAccent,
    },
    message: {
      ...theme.typography.captionS,
      color: theme.colors.redAccent,
      marginTop: 2,
    },
  });
