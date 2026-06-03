import React from 'react';
import {Text, View} from 'react-native';

import {useTheme} from '../../../hooks';

import type {CommonDSProps} from '../types';

import {RadioButton} from './RadioButton';
import {createStyles} from './styles';

export type RadioSectionOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type RadioSectionProps = Omit<CommonDSProps, 'disabled'> & {
  label?: string;
  helperText?: string;
  options: RadioSectionOption[];
  groupValue: string;
  onSelect: (value: string) => void;
};

/**
 * DS RadioSection — composite of label + helper + a list of RadioButtons.
 */
export const RadioSection: React.FC<RadioSectionProps> = ({
  testID = 'ui-radio-section',
  accessibilityLabel,
  style,
  label,
  helperText,
  options,
  groupValue,
  onSelect,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <View
      testID={testID}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.sectionRoot, style]}>
      {label ? <Text style={styles.sectionLabel}>{label}</Text> : null}
      {helperText ? (
        <Text style={styles.sectionHelper}>{helperText}</Text>
      ) : null}
      {options.map(option => (
        <RadioButton
          key={option.value}
          value={option.value}
          groupValue={groupValue}
          onSelect={onSelect}
          disabled={option.disabled}
          accessibilityLabel={option.label}
        />
      ))}
    </View>
  );
};
