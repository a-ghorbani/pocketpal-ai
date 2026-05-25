import React from 'react';
import {View} from 'react-native';

import {useTheme} from '../../../hooks';
import type {TokenRadius} from '../../../theme/tokens/types';

import type {CommonDSProps} from '../types';

import {createStyles} from './styles';

export type SurfaceProps = Omit<CommonDSProps, 'disabled'> & {
  /**
   * Visual radius token. Default `'m'` matches the common card radius
   * in the DS.
   */
  radius?: keyof TokenRadius;
  /**
   * Elevation value (Android shadow + iOS shadow once paired with
   * shadow* props by the consumer). Defaults to `1` to match Paper
   * Surface's v5 default.
   */
  elevation?: number;
  children?: React.ReactNode;
};

/**
 * DS Surface — token-bound background + radius + optional elevation.
 *
 * Defaults: testID='ui-surface', accessibilityRole='none', elevation=1.
 */
export const Surface: React.FC<SurfaceProps> = ({
  testID = 'ui-surface',
  accessibilityRole = 'none',
  accessibilityLabel,
  accessibilityHint,
  style,
  radius = 'm',
  elevation = 1,
  children,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme, {radius});
  return (
    <View
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={[styles.root, {elevation}, style]}>
      {children}
    </View>
  );
};
