import React from 'react';
import {View} from 'react-native';
import {Checkbox as PaperCheckbox} from 'react-native-paper';

import {useTheme} from '../../../hooks';

import type {CommonDSProps} from '../types';
import {warnIfNoA11yLabel} from '../types';

import {createStyles, type CheckboxSize} from './styles';

export type CheckboxVariant = 'default';

export type CheckboxProps = Omit<CommonDSProps, 'accessibilityRole'> & {
  variant?: CheckboxVariant;
  size?: CheckboxSize;
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
};

/**
 * DS Checkbox — Paper wrap (D21). Paper handles accessibilityRole=
 * 'checkbox', accessibilityState, and platform tick visuals.
 *
 * Defaults: variant='default', size='m', testID='ds-checkbox'.
 */
export const Checkbox: React.FC<CheckboxProps> = ({
  testID = 'ds-checkbox',
  accessibilityLabel,
  accessibilityHint,
  style,
  disabled,
  variant: _variant = 'default',
  size = 'm',
  value,
  onValueChange,
}) => {
  const theme = useTheme();
  warnIfNoA11yLabel('Checkbox', undefined, accessibilityLabel);
  const styles = createStyles(theme, {size});
  return (
    <View
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{checked: value, disabled: disabled === true}}
      style={[styles.root, style]}>
      <PaperCheckbox
        status={value ? 'checked' : 'unchecked'}
        onPress={() => onValueChange(!value)}
        disabled={disabled}
        color={theme.colors.primary}
        uncheckedColor={theme.colors.onSurfaceVariant}
      />
    </View>
  );
};
