import React, {forwardRef} from 'react';
import {View, TextInput as RNTextInput} from 'react-native';

import {
  HelperText,
  TextInput as PaperTextInput,
  TextInputProps as PaperTextInputProps,
} from 'react-native-paper';

import {useTheme} from '../../hooks';

import {createStyles} from './styles';

export type TextInputProps = PaperTextInputProps & {
  error?: boolean;
  helperText?: string;
  showDivider?: boolean;
};

export const TextInput = forwardRef<RNTextInput, TextInputProps>(
  ({style, showDivider = false, error, helperText, ...rest}, ref) => {
    const theme = useTheme();
    const styles = createStyles(theme);

    return (
      <View style={styles.container}>
        <PaperTextInput
          ref={ref}
          {...rest}
          dense
          underlineColor={theme.colors.border}
          style={[styles.input, style]}
          placeholderTextColor={theme.colors.placeholder}
          error={error}
        />
        {helperText && (
          <HelperText type={error ? 'error' : 'info'} visible={!!helperText}>
            {helperText}
          </HelperText>
        )}
        {showDivider && <View style={styles.divider} />}
      </View>
    );
  },
);

TextInput.displayName = 'TextInput';
