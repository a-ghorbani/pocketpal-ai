import {StyleSheet} from 'react-native';

import type {Theme} from '../../../utils/types';
import type {TokenRadius} from '../../../theme/tokens/types';

export type SurfaceStyleArgs = {
  radius: keyof TokenRadius;
};

// Surface emits Android `elevation` only. iOS shadows are consumer-owned:
// pocketpal's existing pattern (SquarePalCard, AboutScreen, ChatView, etc.)
// is to set shadowColor/Offset/Opacity/Radius hand-tuned per surface in
// each screen's styles. Paper Surface's MD3 dual-layer synthesis isn't
// pocketpal's design language — most surfaces use ad-hoc opacities
// (0.05 / 0.1 / 0.2 / 0.25) the designer picked per screen. If a future
// slice introduces an elevation token, Surface can read from it.
export const createStyles = (theme: Theme, {radius}: SurfaceStyleArgs) =>
  StyleSheet.create({
    root: {
      backgroundColor: theme.colors.surface,
      ...(radius === 'none' ? {} : {borderRadius: theme.radius[radius]}),
    },
  });
