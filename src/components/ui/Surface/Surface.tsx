import React from 'react';
import {View} from 'react-native';

import {useTheme} from '../../../hooks';
import type {TokenRadius} from '../../../theme/tokens/types';

import type {CommonDSProps} from '../types';

import {createStyles} from './styles';

export type SurfaceProps = Omit<CommonDSProps, 'disabled'> & {
  /**
   * Visual radius token. Default `'none'` keeps Surface as a trivial
   * `View + background + optional elevation` primitive — consumers
   * opt in to a radius when they want one.
   */
  radius?: keyof TokenRadius;
  /**
   * Android-only `elevation` style. iOS shadows are consumer-owned —
   * if a surface needs a drop shadow on iOS, pass
   * `shadowColor/Offset/Opacity/Radius` on the `style` prop alongside
   * `elevation` (the pattern other pocketpal screens already use).
   * Defaults to `1` matching Paper Surface v5's default elevation value.
   */
  elevation?: number;
  children?: React.ReactNode;
};

/**
 * DS Surface — token-bound background + optional radius + Android
 * elevation. Pure visual primitive; consumers wrap their own shadow
 * specs when iOS shadows are wanted.
 *
 * Defaults: testID='ui-surface', accessibilityRole='none', radius='none',
 * elevation=1.
 */
export const Surface: React.FC<SurfaceProps> = ({
  testID = 'ui-surface',
  accessibilityRole = 'none',
  accessibilityLabel,
  accessibilityHint,
  style,
  radius = 'none',
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
