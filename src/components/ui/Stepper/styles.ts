import {StyleSheet, type ViewStyle} from 'react-native';

import type {Theme} from '../../../utils/types';

// Figma 896:29130: inactive 20x4, active 48x4, gap = Spacing/XS, Radius/XS.
const INACTIVE_DOT_WIDTH = 20;
const ACTIVE_DOT_WIDTH = 48;
const DOT_HEIGHT = 4;

export const createStyles = (theme: Theme, isRTL: boolean) => {
  const root: ViewStyle = {
    flexDirection: isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: theme.spacing.xs,
  };
  const dotBase: ViewStyle = {
    height: DOT_HEIGHT,
    borderRadius: theme.radius.xs,
  };
  const dotInactive: ViewStyle = {
    ...dotBase,
    width: INACTIVE_DOT_WIDTH,
    backgroundColor: theme.colors.mutedLight,
  };
  const dotActive: ViewStyle = {
    ...dotBase,
    width: ACTIVE_DOT_WIDTH,
    backgroundColor: theme.colors.primary,
  };
  return StyleSheet.create({root, dotInactive, dotActive});
};
