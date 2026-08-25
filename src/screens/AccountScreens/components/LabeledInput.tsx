import React from 'react';
import {Text, TextInputProps, View} from 'react-native';

import {Input} from '../../../components/ui/Input';

import {useTheme} from '../../../hooks';

import {createStyles} from '../styles';

type LabeledInputProps = {
  testID: string;
  label: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  disabled?: boolean;
  trailing?: React.ReactNode;
  inputProps?: Omit<TextInputProps, 'value' | 'onChangeText'>;
};

/**
 * DS Input with the label rendered outside it. The DS label sets no
 * `textAlign`, so it resolves to first-strong alignment and stays hard-left
 * under RTL while the value mirrors — a split label/value row.
 */
export const LabeledInput: React.FC<LabeledInputProps> = ({
  testID,
  label,
  placeholder,
  value,
  onChangeText,
  disabled,
  trailing,
  inputProps,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Input
        testID={testID}
        accessibilityLabel={label}
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        disabled={disabled}
        trailing={trailing}
        inputProps={inputProps}
      />
    </View>
  );
};
