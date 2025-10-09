import React from 'react';
import {View} from 'react-native';
import {Text} from 'react-native-paper';
import {Controller, useFormContext} from 'react-hook-form';

import type {ParameterDefinition} from '../../types/pal';
import {useTheme} from '../../hooks';
import {createStyles} from './styles';
import {TextInput} from '../TextInput';

interface DynamicTextFieldProps {
  parameter: ParameterDefinition;
  disabled?: boolean;
  error?: string;
}

export const DynamicTextField: React.FC<DynamicTextFieldProps> = ({
  parameter,
  disabled = false,
  error,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const {control} = useFormContext();

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
          <TextInput
            testID={`dynamic-field-${parameter.key}`}
            value={value || ''}
            onChangeText={onChange}
            error={!!error}
            placeholder={parameter.placeholder}
            helperText={error}
            editable={!disabled}
            returnKeyType="default"
          />
        )}
      />
    </View>
  );
};
