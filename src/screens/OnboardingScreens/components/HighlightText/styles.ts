import {StyleSheet} from 'react-native';

import type {Theme} from '../../../../utils/types';

export const createStyles = (theme: Theme, align: 'left' | 'center') =>
  StyleSheet.create({
    bodyText: {
      ...theme.typography.bodyM,
      color: theme.colors.onSurfaceVariant,
      textAlign: align,
    },
    pillRun: {
      // The Figma highlight is a peach rectangle laid under a darker
      // text span via mix-blend-multiply. RN can't reproduce the
      // blend directly; the closest faithful approximation is a
      // background-coloured run with the darker foreground text
      // colour. `accent.peach` is the canonical token (#FCE7CF).
      backgroundColor: theme.colors.accent.peach,
      color: theme.colors.text,
    },
  });
