import {StyleSheet} from 'react-native';

import type {Theme} from '../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    scrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.colors.menuGroupSeparator,
    },
    centerWrapper: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing.m,
    },
    surface: {
      width: '100%',
      maxWidth: 400,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.l,
      overflow: 'hidden',
    },
    body: {
      paddingHorizontal: theme.spacing.m,
      paddingVertical: theme.spacing.s,
    },
  });
