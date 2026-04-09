import React, {useState} from 'react';
import {View} from 'react-native';
import {Text, TextInput as PaperTextInput} from 'react-native-paper';
import {Controller, useFormContext} from 'react-hook-form';

import type {ParameterDefinition} from '../../types/pal';
import {useTheme} from '../../hooks';
import {createStyles} from './styles';
import {TextInput} from '../TextInput';
import {Menu} from '../Menu';

interface DynamicComboboxFieldProps {
  parameter: ParameterDefinition;
  disabled?: boolean;
  error?: string;
}

const ComboboxInput: React.FC<{
  parameter: ParameterDefinition;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  error?: string;
}> = ({parameter, value, onChange, disabled, error}) => {
  const [menuVisible, setMenuVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const options = parameter.options || [];
  const displayValue = isSearching ? searchText : value || '';
  const filteredOptions = isSearching && searchText
    ? options.filter(opt => opt.toLowerCase().includes(searchText.toLowerCase()))
    : options;

  return (
    <Menu
      visible={menuVisible && filteredOptions.length > 0}
      onDismiss={() => {
        setMenuVisible(false);
        setIsSearching(false);
        setSearchText('');
      }}
      selectable
      anchor={
        <TextInput
          testID={`dynamic-combobox-input-${parameter.key}`}
          value={displayValue}
          onChangeText={text => {
            setSearchText(text);
            setIsSearching(true);
            onChange(text);
            setMenuVisible(true);
          }}
          onFocus={() => {
            setIsSearching(false);
            setSearchText('');
            setMenuVisible(true);
          }}
          error={!!error}
          placeholder={parameter.placeholder}
          helperText={error}
          editable={!disabled}
          returnKeyType="default"
          right={
            <PaperTextInput.Icon
              icon={menuVisible ? 'chevron-up' : 'chevron-down'}
              onPress={() => {
                if (menuVisible) {
                  setMenuVisible(false);
                  setIsSearching(false);
                  setSearchText('');
                } else {
                  setIsSearching(false);
                  setSearchText('');
                  setMenuVisible(true);
                }
              }}
            />
          }
        />
      }>
      {filteredOptions.map(option => (
        <Menu.Item
          key={option}
          label={option}
          onPress={() => {
            onChange(option);
            setMenuVisible(false);
            setIsSearching(false);
            setSearchText('');
          }}
          selected={option === value}
          testID={`dynamic-combobox-option-${parameter.key}-${option}`}
        />
      ))}
    </Menu>
  );
};

export const DynamicComboboxField: React.FC<DynamicComboboxFieldProps> = ({
  parameter,
  disabled = false,
  error,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const {control} = useFormContext();

  return (
    <View style={styles.field} testID={`dynamic-combobox-${parameter.key}`}>
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
          <ComboboxInput
            parameter={parameter}
            value={value || ''}
            onChange={onChange}
            disabled={disabled}
            error={error}
          />
        )}
      />
    </View>
  );
};
