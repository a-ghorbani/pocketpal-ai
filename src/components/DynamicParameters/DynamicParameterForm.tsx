import React from 'react';
import {View} from 'react-native';
import {useFormContext} from 'react-hook-form';

import type {ParameterDefinition} from '../../types/pal';
import {useTheme} from '../../hooks';
import {createStyles} from './styles';
import {DynamicTextField} from './DynamicTextField';
import {DynamicOptionField} from './DynamicOptionField';
import {DynamicDateTimeTagField} from './DynamicDateTimeTagField';

interface DynamicParameterFormProps {
  schema: ParameterDefinition[];
  disabled?: boolean;
}

export const DynamicParameterForm: React.FC<DynamicParameterFormProps> = ({
  schema,
  disabled = false,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const {
    formState: {errors},
  } = useFormContext();

  const renderParameter = (parameter: ParameterDefinition) => {
    const commonProps = {
      parameter,
      disabled,
      error: errors[parameter.key]?.message?.toString(),
    };

    switch (parameter.type) {
      case 'text':
        return <DynamicTextField key={parameter.key} {...commonProps} />;

      case 'select':
        return <DynamicOptionField key={parameter.key} {...commonProps} />;

      case 'datetime_tag':
        return <DynamicDateTimeTagField key={parameter.key} {...commonProps} />;

      default:
        // Fallback to text field for unknown types
        return <DynamicTextField key={parameter.key} {...commonProps} />;
    }
  };

  if (schema.length === 0) {
    return null;
  }

  return <View style={styles.innerForm}>{schema.map(renderParameter)}</View>;
};
