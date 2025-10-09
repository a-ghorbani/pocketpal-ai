import React, {useState, useRef} from 'react';
import {View} from 'react-native';

import {Button, Text, Icon} from 'react-native-paper';

import {useTheme} from '../../hooks';

import {Menu} from '../Menu';
import {createStyles} from './styles';

// Icon component for the chevron-down icon
const ChevronDownIcon = ({size, color}: {size: number; color: string}) => (
  <Icon source="chevron-down" size={size} color={color} />
);

export interface SelectorOption<T = string> {
  label: string;
  value: T;
  disabled?: boolean;
  icon?: string;
}

interface SelectorProps<T = string> {
  // Data
  options: SelectorOption<T>[];
  value?: T;
  onChange: (value: T) => void;

  // Display
  label?: string;
  sublabel?: string;
  placeholder?: string;

  // Behavior
  disabled?: boolean;
  required?: boolean;

  // Validation
  error?: boolean;
  helperText?: string;

  // Styling
  mode?: 'outlined' | 'contained' | 'text';
  style?: any;
  buttonStyle?: any;

  // Accessibility
  testID?: string;
}

export const Selector = <T extends string | number>({
  options,
  value,
  onChange,
  label,
  sublabel,
  placeholder = 'Select option',
  disabled = false,
  required = false,
  error = false,
  helperText,
  mode = 'outlined',
  style,
  buttonStyle,
  testID,
}: SelectorProps<T>) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [menuVisible, setMenuVisible] = useState(false);
  const buttonRef = useRef(null);

  // Find the selected option
  const selectedOption = options.find(option => option.value === value);

  // Determine button text
  const buttonText = selectedOption?.label || placeholder;

  // Determine button colors based on state
  const getButtonStyle = () => {
    const baseStyle = [styles.button, buttonStyle];

    if (error) {
      return [...baseStyle, styles.buttonError];
    }

    if (disabled) {
      return [...baseStyle, styles.buttonDisabled];
    }

    return baseStyle;
  };

  const handleOptionSelect = (optionValue: T) => {
    onChange(optionValue);
    setMenuVisible(false);
  };

  const openMenu = () => {
    if (!disabled) {
      setMenuVisible(true);
    }
  };

  return (
    <View style={[styles.container, style]} testID={testID}>
      {/* Label */}
      {label && (
        <Text style={[theme.fonts.titleMediumLight, styles.label]}>
          {label}
          {required && '*'}
        </Text>
      )}

      {/* Sublabel */}
      {sublabel && (
        <Text style={[theme.fonts.bodySmall, styles.sublabel]}>{sublabel}</Text>
      )}

      {/* Selector Button + Menu */}
      <Menu
        visible={menuVisible}
        onDismiss={() => setMenuVisible(false)}
        selectable
        anchor={
          <Button
            ref={buttonRef}
            mode={mode}
            onPress={openMenu}
            disabled={disabled}
            style={getButtonStyle()}
            contentStyle={styles.buttonContent}
            labelStyle={[
              selectedOption ? styles.selectedText : styles.placeholderText,
              disabled && styles.disabledText,
            ]}
            icon={ChevronDownIcon}
            testID={`${testID}-button`}>
            {buttonText}
          </Button>
        }>
        {options.map(option => (
          <Menu.Item
            key={String(option.value)}
            label={option.label}
            onPress={() => handleOptionSelect(option.value)}
            disabled={option.disabled}
            selected={option.value === value}
            leadingIcon={option.icon}
            testID={`${testID}-option-${option.value}`}
          />
        ))}
      </Menu>

      {/* Helper Text / Error */}
      {helperText && (
        <Text
          style={[
            theme.fonts.bodySmall,
            error ? styles.errorText : styles.helperText,
          ]}>
          {helperText}
        </Text>
      )}
    </View>
  );
};
