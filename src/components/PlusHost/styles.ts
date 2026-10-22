import {StyleSheet} from 'react-native';

import type {Theme} from '../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      ...StyleSheet.absoluteFill,
      zIndex: 200,
      elevation: 8,
      backgroundColor: theme.colors.background,
    },
  });

export const scopeStyles = StyleSheet.create({
  scope: {
    flex: 1,
  },
});
