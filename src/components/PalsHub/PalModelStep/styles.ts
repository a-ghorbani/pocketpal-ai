import {StyleSheet} from 'react-native';
import {Theme} from '../../../utils';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      gap: 8,
    },
    modelName: {
      fontSize: 14,
      textAlign: 'center',
      color: theme.colors.onSurfaceVariant,
    },
    message: {
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
    },
    progress: {
      marginVertical: 8,
    },
    button: {
      alignSelf: 'stretch',
    },
  });
