import React, {useState} from 'react';
import {Text, TextInput, View, type TextInputProps} from 'react-native';

import {useTheme} from '../../../hooks';

import type {CommonDSProps} from '../types';

import {createStyles, type InputSize, type InputVariant} from './styles';

export type InputProps = Omit<CommonDSProps, 'accessibilityRole'> & {
  variant?: InputVariant;
  size?: InputSize;
  label?: string;
  helperText?: string;
  errorText?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  value?: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  inputProps?: Omit<TextInputProps, 'value' | 'onChangeText'>;
};

/**
 * DS Input. Wraps RN TextInput with token-bound bottom-divider +
 * helper/error text + leading/trailing slots.
 *
 * Defaults: variant='single', size='m', testID='ds-input'. RN
 * TextInput owns its own a11y so accessibilityRole defaults to 'none'.
 */
export const Input: React.FC<InputProps> = ({
  testID = 'ds-input',
  accessibilityLabel,
  accessibilityHint,
  style,
  disabled,
  variant = 'single',
  size = 'm',
  label,
  helperText,
  errorText,
  leading,
  trailing,
  value,
  onChangeText,
  placeholder,
  multiline,
  inputProps,
}) => {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const state = disabled ? 'disabled' : focused ? 'focused' : 'default';
  const styles = createStyles(theme, {
    variant,
    size,
    state,
    hasError: !!errorText,
  });
  return (
    <View style={style}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.root}>
        {leading}
        <TextInput
          testID={testID}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityHint={accessibilityHint}
          editable={!disabled}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.onSurfaceVariant}
          multiline={multiline ?? variant === 'multi'}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={styles.input}
          {...inputProps}
        />
        {trailing}
      </View>
      {(errorText ?? helperText) ? (
        <Text style={styles.helper}>{errorText ?? helperText}</Text>
      ) : null}
    </View>
  );
};
