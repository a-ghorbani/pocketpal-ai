import React from 'react';
import {View} from 'react-native';

import {useTheme} from '../../../hooks';

import type {CommonDSProps} from '../types';

import {createStyles, type TabsSize, type TabsVariant} from './styles';
import {TabItem} from './TabItem';

export type TabsItem = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type TabsProps = Omit<CommonDSProps, 'disabled'> & {
  variant?: TabsVariant;
  size?: TabsSize;
  items: TabsItem[];
  selectedValue: string;
  onChange: (value: string) => void;
};

/**
 * DS Tabs. Defaults: variant='underline', size='m', testID='ui-tabs',
 * accessibilityRole='tablist'. Each item is a Pressable with
 * accessibilityRole='tab' and selected state from `selectedValue`.
 */
export const Tabs: React.FC<TabsProps> = ({
  testID = 'ui-tabs',
  accessibilityRole = 'tablist',
  accessibilityLabel,
  style,
  variant = 'underline',
  size = 'm',
  items,
  selectedValue,
  onChange,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme, {variant, size});
  return (
    <View
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      style={[styles.root, style]}>
      {items.map(item => (
        <TabItem
          key={item.value}
          value={item.value}
          label={item.label}
          variant={variant}
          size={size}
          selected={item.value === selectedValue}
          disabled={item.disabled}
          onPress={onChange}
        />
      ))}
    </View>
  );
};
