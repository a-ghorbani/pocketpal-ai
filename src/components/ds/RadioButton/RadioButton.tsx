import React from 'react';
import {View} from 'react-native';
import {RadioButton as PaperRadioButton} from 'react-native-paper';

import {useTheme} from '../../../hooks';

import type {CommonDSProps} from '../types';
import {warnIfNoA11yLabel} from '../types';

import {createStyles, type RadioButtonSize} from './styles';

export type RadioButtonVariant = 'default';

export type RadioButtonProps = Omit<CommonDSProps, 'accessibilityRole'> & {
  variant?: RadioButtonVariant;
  size?: RadioButtonSize;
  value: string;
  groupValue: string;
  onSelect: (value: string) => void;
  accessibilityLabel: string;
};

/**
 * DS RadioButton (wraps Paper RadioButton).
 *
 * Defaults: variant='default', size='m', testID='ds-radio-<value>',
 * accessibilityRole='radio'.
 */
export const RadioButton: React.FC<RadioButtonProps> = ({
  testID,
  accessibilityLabel,
  accessibilityHint,
  style,
  disabled,
  variant: _variant = 'default',
  size = 'm',
  value,
  groupValue,
  onSelect,
}) => {
  const theme = useTheme();
  warnIfNoA11yLabel('RadioButton', undefined, accessibilityLabel);
  const styles = createStyles(theme, {size});
  const resolvedTestID = testID ?? `ds-radio-${value}`;
  return (
    <View
      testID={resolvedTestID}
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{
        selected: value === groupValue,
        disabled: disabled === true,
      }}
      style={[styles.root, style]}>
      <PaperRadioButton
        value={value}
        status={value === groupValue ? 'checked' : 'unchecked'}
        onPress={() => onSelect(value)}
        disabled={disabled}
        color={theme.colors.primary}
        uncheckedColor={theme.colors.onSurfaceVariant}
      />
    </View>
  );
};
