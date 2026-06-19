import React, {useRef, useState} from 'react';
import {View, type LayoutRectangle} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import {useTheme} from '../../../hooks';

import type {CommonDSProps} from '../types';

import {NavItem} from './NavItem';
import {createStyles, type BottomNavBarVariant} from './styles';

// Quick, subtle glide for the active pill between tabs.
const PILL_TIMING = {duration: 180};

export type BottomNavBarItem = {
  value: string;
  label: string;
  icon: React.ReactNode;
};

export type BottomNavBarProps = Omit<CommonDSProps, 'disabled'> & {
  items: BottomNavBarItem[];
  selectedValue: string;
  onSelect: (value: string) => void;
  variant?: BottomNavBarVariant;
};

/**
 * DS BottomNavBar — presentational shell (no navigation wiring).
 *
 * `default` = bordered top-line bar, active item shown via text color.
 * `floating` = rounded floating bar with a yellow pill on the active item.
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
  variant = 'default',
}) => {
  const theme = useTheme();
  const styles = createStyles(theme, {variant});
  const isFloating = variant === 'floating';

  // Per-item frames, captured on layout, used to position the sliding pill.
  const layoutsRef = useRef<Record<string, LayoutRectangle>>({});
  const [pillReady, setPillReady] = useState(false);
  const pillX = useSharedValue(0);
  const pillWidth = useSharedValue(0);

  const movePillTo = (value: string, animated: boolean) => {
    const frame = layoutsRef.current[value];
    if (!frame) {
      return;
    }
    if (animated) {
      pillX.value = withTiming(frame.x, PILL_TIMING);
      pillWidth.value = withTiming(frame.width, PILL_TIMING);
    } else {
      pillX.value = frame.x;
      pillWidth.value = frame.width;
    }
    if (!pillReady) {
      setPillReady(true);
    }
  };

  const handleItemLayout = (value: string, frame: LayoutRectangle) => {
    layoutsRef.current[value] = frame;
    // First measurement of the selected tab seats the pill without animating.
    if (value === selectedValue) {
      movePillTo(value, pillReady);
    }
  };

  const handleSelect = (value: string) => {
    if (isFloating) {
      movePillTo(value, true);
    }
    onSelect(value);
  };

  const pillAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{translateX: pillX.value}],
    width: pillWidth.value,
  }));

  return (
    <View
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      style={[styles.root, style]}>
      {isFloating && pillReady ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.pill, pillAnimatedStyle]}
        />
      ) : null}
      {items.map(item => (
        <NavItem
          key={item.value}
          value={item.value}
          label={item.label}
          icon={item.icon}
          selected={item.value === selectedValue}
          onSelect={handleSelect}
          variant={variant}
          onLayout={
            isFloating
              ? e => handleItemLayout(item.value, e.nativeEvent.layout)
              : undefined
          }
        />
      ))}
    </View>
  );
};
