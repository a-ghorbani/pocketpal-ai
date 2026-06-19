import {StyleSheet} from 'react-native';

import type {Theme} from '../../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      width: '100%',
      alignItems: 'center',
      gap: theme.spacing.s,
    },
    eyebrow: {
      ...theme.typography.bodyM,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
    },
    bodyWrap: {
      width: '100%',
      alignItems: 'center',
    },
  });
