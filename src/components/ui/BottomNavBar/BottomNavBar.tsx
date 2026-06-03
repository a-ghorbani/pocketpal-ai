import React from 'react';
import {View} from 'react-native';

import {useTheme} from '../../../hooks';

import type {CommonDSProps} from '../types';

import {NavItem} from './NavItem';
import {createStyles} from './styles';

export type BottomNavBarItem = {
  value: string;
  label: string;
  icon: React.ReactNode;
};

export type BottomNavBarProps = Omit<CommonDSProps, 'disabled'> & {
  items: BottomNavBarItem[];
  selectedValue: string;
  onSelect: (value: string) => void;
};

/**
 * DS BottomNavBar — presentational shell (no navigation wiring).
 *
 * Defaults: testID='ui-bottom-nav', accessibilityRole='tablist'.
 * Item testID: 'ui-bottom-nav-item-<value>'; item role 'tab'.
 */
export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  testID = 'ui-bottom-nav',
  accessibilityRole = 'tablist',
  accessibilityLabel,
  style,
  items,
  selectedValue,
  onSelect,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme, {});
  return (
    <View
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      style={[styles.root, style]}>
      {items.map(item => (
        <NavItem
          key={item.value}
          value={item.value}
          label={item.label}
          icon={item.icon}
          selected={item.value === selectedValue}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
};
