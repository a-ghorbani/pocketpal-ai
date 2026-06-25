import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

export const styles = ({theme}: {theme: Theme}) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    headerIcon: {
      fontSize: 14,
      marginRight: 6,
      color: theme.colors.onSurfaceVariant,
    },
    headerText: {
      fontSize: 12,
      flexShrink: 1,
      color: theme.colors.onSurfaceVariant,
    },
    result: {
      marginBottom: 8,
    },
    title: {
      color: theme.colors.onSurface,
    },
    url: {
      fontSize: 11,
      marginTop: 1,
      color: theme.colors.onSurfaceVariant,
    },
    snippet: {
      fontSize: 12,
      marginTop: 2,
      color: theme.colors.onSurface,
    },
    empty: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
    },
  });
