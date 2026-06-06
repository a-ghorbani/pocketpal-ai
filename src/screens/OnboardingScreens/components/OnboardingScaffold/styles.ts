import {StyleSheet} from 'react-native';

import type {Theme} from '../../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      // Figma `Color/Background/Muted` (#fafafa) is the canvas. Our
      // closest token is `surface` (#F9FAFB). The previous binding to
      // `surfaceVariant` (#e4e4e6) was too dark and caused the muted
      // stepper dots (#e5e3e1) to blend into the background.
      backgroundColor: theme.colors.surface,
    },
    body: {
      flex: 1,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.m,
      position: 'relative',
    },
    bodyCentered: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.xl,
    },
    bodyTop: {
      alignItems: 'center',
      paddingTop: theme.spacing.xxl,
      gap: theme.spacing.ml,
    },
    topLeftSlot: {
      position: 'absolute',
      top: 16,
      left: 16,
      zIndex: 2,
    },
    bottom: {
      paddingHorizontal: 0,
    },
  });
