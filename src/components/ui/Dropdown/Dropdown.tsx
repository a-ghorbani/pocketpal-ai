import React, {useState} from 'react';
import {Text} from 'react-native';
import {Menu} from 'react-native-paper';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {useTheme} from '../../../hooks';
import {Pressable} from '../primitives/Pressable';

import type {CommonDSProps} from '../types';

import {createStyles, type DropdownSize} from './styles';

export type DropdownOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type DropdownProps = CommonDSProps & {
  variant?: 'standard';
  size?: DropdownSize;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
};

/**
 * DS Dropdown. Wrap-Paper family: trigger rebuilt against tokens; popup
 * uses Paper `Menu` directly (positioning, dismiss, item rendering).
 *
 * Defaults: variant='standard', size='m', testID='ui-dropdown',
 * accessibilityRole='button'.
 */
export const Dropdown: React.FC<DropdownProps> = ({
  testID = 'ui-dropdown',
  accessibilityRole = 'button',
  accessibilityLabel,
  accessibilityHint,
  style,
  disabled,
  variant: _variant = 'standard',
  size = 'm',
  value,
  options,
  onChange,
  placeholder,
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const styles = createStyles(theme, {size, disabled});
  const selected = options.find(o => o.value === value);
  const triggerLabel = selected?.label ?? placeholder ?? '';
  return (
    <Menu
      visible={open}
      onDismiss={() => setOpen(false)}
      statusBarHeight={insets.top}
      anchor={
        <Pressable
          testID={testID}
          accessibilityRole={accessibilityRole}
          accessibilityLabel={accessibilityLabel ?? triggerLabel}
          accessibilityHint={accessibilityHint}
          disabled={disabled}
          onPress={() => setOpen(true)}
          style={[styles.trigger, style]}>
          <Text style={styles.label}>{triggerLabel}</Text>
        </Pressable>
      }>
      {options.map(option => (
        <Menu.Item
          key={option.value}
          title={option.label}
          disabled={option.disabled}
          onPress={() => {
            onChange(option.value);
            setOpen(false);
          }}
        />
      ))}
    </Menu>
  );
};
