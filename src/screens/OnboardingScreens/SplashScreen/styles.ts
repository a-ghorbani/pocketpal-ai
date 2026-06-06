import {StyleSheet} from 'react-native';

import type {Theme} from '../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      // Figma `Color/Background/Muted` (#fafafa) — maps to
      // `colors.surfaceVariant` per WHAT §4h.
      backgroundColor: theme.colors.surfaceVariant,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
