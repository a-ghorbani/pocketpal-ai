import React from 'react';
import {View} from 'react-native';

import {useTheme} from '../../../hooks';
import {Pressable} from '../primitives/Pressable';

import type {CommonDSProps} from '../types';

import {createStyles, type CardSize, type CardVariant} from './styles';

export type CardProps = CommonDSProps & {
  variant?: CardVariant;
  size?: CardSize;
  onPress?: () => void;
  children?: React.ReactNode;
};

/**
 * DS Card — rebuild family (D17). Token-bound View + radius + padding;
 * optional elevation (variant='elevated') or outline (variant=
 * 'outlined'). When `onPress` is supplied, wraps children in the
 * Pressable primitive for the state-layer overlay.
 *
 * Defaults: variant='flat', size='m', testID='ds-card',
 * accessibilityRole='none'.
 */
export const Card: React.FC<CardProps> = ({
  testID = 'ds-card',
  accessibilityRole = 'none',
  accessibilityLabel,
  accessibilityHint,
  style,
  disabled,
  variant = 'flat',
  size = 'm',
  onPress,
  children,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme, {variant, size});

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        disabled={disabled}
        onPress={onPress}
        style={[styles.root, style]}>
        {children}
      </Pressable>
    );
  }

  return (
    <View
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={[styles.root, style]}>
      {children}
    </View>
  );
};
