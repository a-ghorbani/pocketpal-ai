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
    const multilineStyle =
      rest.numberOfLines && rest.numberOfLines > 1
        ? {
            minHeight: rest.numberOfLines * 18,
            textAlignVertical: 'top',
            flexGrow: 1,
            paddingTop: 8,
          }
        : {};

    return (
      <View>
        <PaperTextInput
          ref={ref}
          {...rest}
          dense
          underlineColor={theme.colors.border}
          style={[styles.container, style]}
          contentStyle={
            [
              multilineStyle,
              rest.contentStyle,
            ] as PaperTextInputProps['contentStyle']
          }
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
