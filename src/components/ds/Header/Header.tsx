import React from 'react';
import {Text, View} from 'react-native';

import {useTheme} from '../../../hooks';

import type {CommonDSProps} from '../types';

import {createStyles} from './styles';

export type HeaderProps = Omit<CommonDSProps, 'disabled'> & {
  title?: string;
  subtitle?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  align?: 'leading' | 'center';
};

/**
 * Header — the shared building block for every DS overlay
 * (Sheet, Modal, Dialog). Every DS overlay MUST compose `<Header>`;
 * bespoke header markup inside an overlay is forbidden.
 *
 * Defaults: testID='ds-header', accessibilityRole='header',
 * align='leading'.
 */
export const Header: React.FC<HeaderProps> = ({
  testID = 'ds-header',
  accessibilityRole = 'header',
  accessibilityLabel,
  accessibilityHint,
  style,
  title,
  subtitle,
  leading,
  trailing,
  align = 'leading',
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const centerLayout = align === 'center';

  return (
    <View
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={[styles.root, centerLayout && styles.rootCenter, style]}>
      {leading ? <View style={styles.leadingSlot}>{leading}</View> : null}
      <View
        style={centerLayout ? styles.titleColumnCenter : styles.titleColumn}>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {trailing ? <View style={styles.trailingSlot}>{trailing}</View> : null}
    </View>
  );
};
