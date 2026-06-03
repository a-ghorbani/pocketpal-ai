import React from 'react';
import {Text} from 'react-native';

import {useTheme} from '../../../hooks';
import {Pressable} from '../primitives/Pressable';

import type {CommonDSProps, WithRequiredA11yLabel} from '../types';
import {warnIfNoA11yLabel} from '../types';

import {createStyles, type ButtonSize, type ButtonVariant} from './styles';

type ButtonBase = CommonDSProps & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  label?: string;
  accessibilityLabel?: string;
  onPress?: () => void;
  loading?: boolean;
  children?: React.ReactNode;
};

export type ButtonProps = WithRequiredA11yLabel<ButtonBase>;

/**
 * DS Button. Built on Pressable + token styles; no react-native-paper.
 *
 * Defaults: variant='primary', size='m', testID='ui-button',
 * accessibilityRole='button'. `label` or `accessibilityLabel` (or
 * both) is required at every call-site.
 */
export const Button: React.FC<ButtonProps> = props => {
  const theme = useTheme();
  const {
    testID = 'ui-button',
    accessibilityRole = 'button',
    accessibilityLabel,
    accessibilityHint,
    style,
    disabled,
    variant = 'primary',
    size = 'm',
    label,
    onPress,
    children,
  } = props as ButtonBase;
  warnIfNoA11yLabel('Button', label, accessibilityLabel);
  const styles = createStyles(theme, {variant, size, disabled});
  return (
    <Pressable
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      onPress={onPress}
      style={[styles.root, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {children}
    </Pressable>
  );
};
