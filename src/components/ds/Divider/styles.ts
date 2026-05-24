import {StyleSheet} from 'react-native';

import type {Theme} from '../../../utils/types';
import type {TokenStroke} from '../../../theme/tokens/types';

export type DividerVariant = 'horizontal' | 'vertical';

export type DividerStyleArgs = {
  variant: DividerVariant;
  thickness: keyof TokenStroke;
};

export const createStyles = (
  theme: Theme,
  {variant, thickness}: DividerStyleArgs,
) =>
  StyleSheet.create({
    root: {
      backgroundColor: theme.colors.outlineVariant,
      ...(variant === 'horizontal'
        ? {height: theme.stroke[thickness], alignSelf: 'stretch'}
        : {width: theme.stroke[thickness], alignSelf: 'stretch'}),
    },
  });
