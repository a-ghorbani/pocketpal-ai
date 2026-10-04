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
    group: {
      gap: 8,
    },
    prompt: {
      alignItems: 'center',
    },
    promptActions: {
      flexDirection: 'row',
      gap: 8,
    },
    status: {
      fontSize: 14,
      color: theme.colors.onSurface,
      textAlign: 'center',
    },
    link: {
      color: theme.colors.primary,
      textDecorationLine: 'underline',
    },
  });
