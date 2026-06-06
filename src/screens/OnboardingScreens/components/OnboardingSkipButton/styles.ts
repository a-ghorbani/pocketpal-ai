import {StyleSheet} from 'react-native';

import type {Theme} from '../../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      // Figma `884:32492` Buttons (Skip) — pill, padding xxs, radius
      // m, height 28. Background is transparent so it floats over
      // the body bg.
      height: 28,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: theme.spacing.none,
      borderRadius: theme.radius.m,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      ...theme.typography.titleS,
      color: theme.colors.onBackground,
    },
  });
