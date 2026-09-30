import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: theme.colors.surfaceVariant,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    label: {
      color: theme.colors.onSurfaceVariant,
      flex: 1,
    },
    progress: {
      height: 4,
      borderRadius: 2,
    },
  });
