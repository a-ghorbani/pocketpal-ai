import React from 'react';
import {View} from 'react-native';
import {RadioButton as PaperRadioButton} from 'react-native-paper';

import {useTheme} from '../../../hooks';

import type {CommonDSProps} from '../types';
import {warnIfNoA11yLabel} from '../types';

import {createStyles} from './styles';

export type RadioButtonVariant = 'default';

export type RadioButtonProps = Omit<CommonDSProps, 'accessibilityRole'> & {
  variant?: RadioButtonVariant;
  value: string;
  groupValue: string;
  onSelect: (value: string) => void;
  accessibilityLabel: string;
};

/**
 * DS RadioButton (wraps Paper RadioButton).
 *
 * Defaults: variant='default', testID='ui-radio-<value>',
 * accessibilityRole='radio'. Size is owned by Paper and not exposed
 * on the DS surface.
 */
export const RadioButton: React.FC<RadioButtonProps> = ({
  testID,
  accessibilityLabel,
  accessibilityHint,
  style,
  disabled,
  variant: _variant = 'default',
  value,
  groupValue,
  onSelect,
}) => {
  const theme = useTheme();
  warnIfNoA11yLabel('RadioButton', undefined, accessibilityLabel);
  const styles = createStyles(theme);
  const resolvedTestID = testID ?? `ui-radio-${value}`;
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
