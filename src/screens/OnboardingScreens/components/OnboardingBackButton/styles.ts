import {StyleSheet} from 'react-native';

import type {Theme} from '../../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      // Figma `888:33641` Buttons (Back): 48×48, radius ml=16,
      // bg Color/Secondary/Default (#f3f2f2), border 0.5 Color/Border/
      // Light-grey (#e5e3e1).
      width: 48,
      height: 48,
      borderRadius: theme.radius.ml,
      borderWidth: theme.stroke.sm,
      borderColor: theme.colors.mutedLight,
      backgroundColor: theme.colors.secondaryDefault,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
