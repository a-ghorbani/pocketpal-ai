import React from 'react';
import {Text, type LayoutChangeEvent} from 'react-native';

import {useTheme} from '../../../hooks';
import {Pressable} from '../primitives/Pressable';

import {createStyles, type BottomNavBarVariant} from './styles';

export type NavItemProps = {
  value: string;
  label: string;
  icon: React.ReactNode;
  selected: boolean;
  onSelect: (value: string) => void;
  testID?: string;
  variant?: BottomNavBarVariant;
  onLayout?: (event: LayoutChangeEvent) => void;
};

export const NavItem: React.FC<NavItemProps> = ({
  value,
  label,
  icon,
  selected,
  onSelect,
  testID,
  variant = 'default',
  onLayout,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme, {variant, selected});
  const resolvedTestID = testID ?? `ui-bottom-nav-item-${value}`;
  return (
    <Pressable
      testID={resolvedTestID}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{selected}}
      onPress={() => onSelect(value)}
      onLayout={onLayout}
      style={styles.item}>
      {icon}
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
};
