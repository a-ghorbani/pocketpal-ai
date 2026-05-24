import React from 'react';
import {View} from 'react-native';

import {useTheme} from '../../../hooks';
import type {TokenStroke} from '../../../theme/tokens/types';

import type {CommonDSProps} from '../types';

import {createStyles, type DividerVariant} from './styles';

export type DividerProps = Omit<CommonDSProps, 'disabled'> & {
  variant?: DividerVariant;
  thickness?: keyof TokenStroke;
};

/**
 * DS Divider — rebuild family. Single-thickness rule from
 * theme.stroke.<thickness> with theme.colors.outlineVariant.
 *
 * Defaults: variant='horizontal', thickness='sm', testID='ds-divider',
 * accessibilityRole='none'.
 */
export const Divider: React.FC<DividerProps> = ({
  testID = 'ds-divider',
  accessibilityRole = 'none',
  accessibilityLabel,
  style,
  variant = 'horizontal',
  thickness = 'sm',
}) => {
  const theme = useTheme();
  const styles = createStyles(theme, {variant, thickness});
  return (
    <View
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      style={[styles.root, style]}
    />
  );
};
