import React, {forwardRef} from 'react';
import {View, type TextInputInstance} from 'react-native';

import {
  HelperText,
  TextInput as PaperTextInput,
  TextInputProps as PaperTextInputProps,
} from 'react-native-paper';

import {useTheme} from '../../hooks';

import {renderSheetAwareInput} from './SheetAwareNativeInput';
import {createStyles} from './styles';

export type TextInputProps = PaperTextInputProps & {
  error?: boolean;
  helperText?: string;
  showDivider?: boolean;
};

export const TextInput = forwardRef<TextInputInstance, TextInputProps>(
  ({style, showDivider = false, error, helperText, ...rest}, ref) => {
    const theme = useTheme();
    const styles = createStyles(theme);
    const multilineStyle =
      rest.numberOfLines && rest.numberOfLines > 1
        ? {
            minHeight: rest.numberOfLines * 18,
            textAlignVertical: 'top',
          }
        : {};

    return (
      <View>
        <PaperTextInput
          ref={ref}
          {...rest}
          render={rest.render ?? renderSheetAwareInput}
          dense
          underlineColor={theme.colors.border}
          style={[styles.container, style]}
          contentStyle={multilineStyle as PaperTextInputProps['contentStyle']}
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
