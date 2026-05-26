import {StyleSheet} from 'react-native';

import type {Theme} from '../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    surface: {
      flex: 1,
      backgroundColor: theme.colors.surface,
    },
    body: {
      flex: 1,
      paddingHorizontal: theme.spacing.m,
      paddingVertical: theme.spacing.s,
    },
  });
