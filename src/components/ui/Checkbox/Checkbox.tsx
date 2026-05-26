import React from 'react';
import {View} from 'react-native';
import {Checkbox as PaperCheckbox} from 'react-native-paper';

import {useTheme} from '../../../hooks';

import type {CommonDSProps} from '../types';
import {warnIfNoA11yLabel} from '../types';

import {createStyles} from './styles';

export type CheckboxVariant = 'default';

export type CheckboxProps = Omit<CommonDSProps, 'accessibilityRole'> & {
  variant?: CheckboxVariant;
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
};

/**
 * DS Checkbox (wraps Paper Checkbox).
 *
 * Defaults: variant='default', testID='ui-checkbox'. Size is owned by
 * Paper and not exposed on the DS surface.
 */
export const Checkbox: React.FC<CheckboxProps> = ({
  testID = 'ui-checkbox',
  accessibilityLabel,
  accessibilityHint,
  style,
  disabled,
  variant: _variant = 'default',
  value,
  onValueChange,
}) => {
  const theme = useTheme();
  warnIfNoA11yLabel('Checkbox', undefined, accessibilityLabel);
  const styles = createStyles(theme);
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
