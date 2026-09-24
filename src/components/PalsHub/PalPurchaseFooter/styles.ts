import {StyleSheet} from 'react-native';
import {Theme} from '../../../utils';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      gap: 8,
    },
    name: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.onSurface,
      textAlign: 'center',
    },
    button: {
      alignSelf: 'stretch',
    },
    caption: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
    },
    status: {
      fontSize: 14,
      color: theme.colors.onSurface,
      textAlign: 'center',
    },
  });
