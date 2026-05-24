import {StyleSheet} from 'react-native';

import type {Theme} from '../../../utils/types';
import type {TokenRadius} from '../../../theme/tokens/types';

export type SurfaceStyleArgs = {
  radius: keyof TokenRadius;
};

export const createStyles = (theme: Theme, {radius}: SurfaceStyleArgs) =>
  StyleSheet.create({
    root: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius[radius],
    },
  });
