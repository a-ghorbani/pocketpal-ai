import React from 'react';
import {View, TouchableOpacity} from 'react-native';
import {Text} from 'react-native-paper';
import {Controller, useFormContext} from 'react-hook-form';

import type {ParameterDefinition} from '../../types/pal';
import {useTheme} from '../../hooks';
import {createStyles} from './styles';

interface DynamicDateTimeTagFieldProps {
  parameter: ParameterDefinition;
  disabled?: boolean;
  error?: string;
}

export const DynamicDateTimeTagField: React.FC<
  DynamicDateTimeTagFieldProps
> = ({parameter, disabled = false, error}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const {control} = useFormContext();

  const handleInsertDateTime = (onChange: (value: string) => void) => {
    onChange('{{datetime}}');
  };

  return (
    <View style={styles.field}>
      <Text style={theme.fonts.titleMediumLight}>
        {parameter.label}
        {parameter.required && '*'}
      </Text>
      {parameter.description && (
        <Text style={styles.sublabel}>{parameter.description}</Text>
      )}

      <Controller
        control={control}
        name={parameter.key}
        rules={{
          required: parameter.required
            ? `${parameter.label} is required`
            : false,
        }}
        render={({field: {onChange, value}}) => (
          <View>
            <TouchableOpacity
              style={[
                styles.dateTimeButton,
                error
                  ? styles.dateTimeButtonError
                  : styles.dateTimeButtonNormal,
                disabled && styles.dateTimeButtonDisabled,
              ]}
              onPress={() => !disabled && handleInsertDateTime(onChange)}
              disabled={disabled}
              testID={`dynamic-datetime-${parameter.key}`}>
              {value === '{{datetime}}' ? (
                <View style={styles.dateTimeTagContainer}>
                  <Text
                    style={[theme.fonts.bodyMedium, styles.dateTimeTagText]}>
                    Current Date & Time Tag
                  </Text>
                  <Text
                    style={[theme.fonts.bodySmall, styles.dateTimeTagSubtext]}>
                    Will be replaced with current date/time when used
                  </Text>
                </View>
              ) : (
                <Text
                  style={[
                    theme.fonts.bodyMedium,
                    styles.dateTimePlaceholderText,
                  ]}>
                  {parameter.placeholder ||
                    'Tap to insert current date & time tag'}
                </Text>
              )}
            </TouchableOpacity>

            {error && (
              <Text style={[theme.fonts.bodySmall, styles.errorText]}>
                {error}
              </Text>
            )}
          </View>
        )}
      />
    </View>
  );
};
