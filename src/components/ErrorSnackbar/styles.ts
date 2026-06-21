import {StyleSheet} from 'react-native';
import {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    snackbar: {
      backgroundColor: theme.colors.errorContainer,
      borderRadius: theme.radius.m,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    icon: {
      marginEnd: theme.spacing.s,
    },
    message: {
      ...theme.typography.uiM,
      color: theme.colors.onErrorContainer,
      flex: 1,
    },
    wrapper: {
      zIndex: 9999,
    },
  });
