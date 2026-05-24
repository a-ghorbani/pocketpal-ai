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
 * DS Tabs — rebuild family (D18). Canonical Figma `764:27807` (D9).
 *
 * Defaults: variant='underline', size='m', testID='ds-tabs',
 * accessibilityRole='tablist'. Each item is a Pressable with
 * accessibilityRole='tab' and selected state from `selectedValue`.
 */
export const Tabs: React.FC<TabsProps> = ({
  testID = 'ds-tabs',
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
