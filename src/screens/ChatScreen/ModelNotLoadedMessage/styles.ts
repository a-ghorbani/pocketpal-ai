import {StyleSheet} from 'react-native';

import {Theme} from '../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      minHeight: 85, // Reserves space the chat view reads for its bottom padding.
      backgroundColor: 'transparent',
    },
    snackbar: {
      borderRadius: theme.radius.m,
    },
    actionLabel: {
      color: theme.colors.inverseSecondary,
    },
  });
