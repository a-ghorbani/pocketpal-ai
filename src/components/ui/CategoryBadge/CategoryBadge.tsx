import React from 'react';
import {Text, View} from 'react-native';

import {useTheme} from '../../../hooks';

import type {CommonDSProps} from '../types';

import {
  createStyles,
  type CategoryBadgeSize,
  type CategoryBadgeVariant,
} from './styles';

export type CategoryBadgeProps = Omit<CommonDSProps, 'disabled'> & {
  variant?: CategoryBadgeVariant;
  size?: CategoryBadgeSize;
  label: string;
};

/**
 * DS CategoryBadge — non-interactive label tile from the category
 * palette.
 *
 * Defaults: variant='neutral', size='m', testID='ui-category-badge',
 * accessibilityRole='text'.
 */
export const CategoryBadge: React.FC<CategoryBadgeProps> = ({
  testID = 'ui-category-badge',
  accessibilityRole = 'text',
  accessibilityLabel,
  style,
  variant = 'neutral',
  size = 'm',
  label,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme, {variant, size});
  return (
    <View
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.root, style]}>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
};
