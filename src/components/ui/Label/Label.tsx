import React from 'react';
import {Text, View} from 'react-native';

import {useTheme} from '../../../hooks';

import type {CommonDSProps} from '../types';

import {createStyles, type LabelSize, type LabelVariant} from './styles';

export type LabelProps = Omit<CommonDSProps, 'disabled'> & {
  variant?: LabelVariant;
  size?: LabelSize;
  label: string;
  leadingIcon?: React.ReactNode;
};

/**
 * DS Label — Informational + Status. Pure visual primitive
 * (View + colored background + optional icon).
 *
 * Defaults: variant='informational', size='m', testID='ui-label',
 * accessibilityRole='text'.
 */
export const Label: React.FC<LabelProps> = ({
  testID = 'ui-label',
  accessibilityRole = 'text',
  accessibilityLabel,
  style,
  variant = 'informational',
  size = 'm',
  label,
  leadingIcon,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme, {variant, size});
  return (
    <View
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.root, style]}>
      {leadingIcon}
      <Text style={styles.label}>{label}</Text>
    </View>
  );
};
