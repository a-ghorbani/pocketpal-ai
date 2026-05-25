import React, {useState} from 'react';
import {Text} from 'react-native';

import {useTheme} from '../../../hooks';
import {Menu} from '../../Menu';
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
 * DS Dropdown. Composes the existing `src/components/Menu` wrapper
 * so the DS layer does not import Paper directly.
 *
 * Defaults: variant='standard', size='m', testID='ds-dropdown',
 * accessibilityRole='button'.
 */
export const Dropdown: React.FC<DropdownProps> = ({
  testID = 'ds-dropdown',
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
  const [open, setOpen] = useState(false);
  const styles = createStyles(theme, {size, disabled});
  const selected = options.find(o => o.value === value);
  const triggerLabel = selected?.label ?? placeholder ?? '';
  return (
    <Menu
      visible={open}
      onDismiss={() => setOpen(false)}
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
          label={option.label}
          disabled={option.disabled}
          selected={option.value === value}
          onPress={() => {
            onChange(option.value);
            setOpen(false);
          }}
        />
      ))}
    </Menu>
  );
};
