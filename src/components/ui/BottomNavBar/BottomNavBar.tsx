import React, {useEffect, useRef, useState} from 'react';
import {
  I18nManager,
  View,
  type LayoutChangeEvent,
  type LayoutRectangle,
} from 'react-native';
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

/**
 * Physical `left` for the active pill. `onLayout` reports `x` from the layout
 * direction's START edge — physical-left in LTR, but the RIGHT edge in RTL — so
 * in RTL we mirror it against the container width to get a physical left. The
 * pill is then driven via the physical `left` property (NOT `transform:
 * translateX`, which RN flips under RTL and threw the pill off-screen).
 */
export const pillLeft = (
  frameX: number,
  frameWidth: number,
  containerWidth: number,
  isRTL: boolean,
): number => {
  const left = isRTL ? containerWidth - frameX - frameWidth : frameX;
  // Normalise -0 to 0 (identical position; keeps equality checks clean).
  return left === 0 ? 0 : left;
};

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
  const isRTL = I18nManager.isRTL;

  // Per-item frames, captured on layout, used to position the sliding pill.
  const layoutsRef = useRef<Record<string, LayoutRectangle>>({});
  const containerWidthRef = useRef(0);
  const [pillReady, setPillReady] = useState(false);
  const pillX = useSharedValue(0);
  const pillWidth = useSharedValue(0);

  // Prefer the measured container width; before the root has laid out, fall
  // back to the items' extent so the pill can still seat (then re-seats exactly
  // once the root width arrives).
  const containerWidth = () => {
    if (containerWidthRef.current) {
      return containerWidthRef.current;
    }
    let w = 0;
    for (const f of Object.values(layoutsRef.current)) {
      w = Math.max(w, f.x + f.width);
    }
    return w;
  };

  const movePillTo = (value: string, animated: boolean) => {
    const frame = layoutsRef.current[value];
    if (!frame) {
      return;
    }
    const left = pillLeft(frame.x, frame.width, containerWidth(), isRTL);
    if (animated) {
      pillX.value = withTiming(left, PILL_TIMING);
      pillWidth.value = withTiming(frame.width, PILL_TIMING);
    } else {
      pillX.value = left;
      pillWidth.value = frame.width;
    }
    if (!pillReady) {
      setPillReady(true);
    }
  };

  const handleRootLayout = (e: LayoutChangeEvent) => {
    containerWidthRef.current = e.nativeEvent.layout.width;
    // Re-seat with the exact width (the RTL mirror depends on it).
    if (isFloating) {
      movePillTo(selectedValue, false);
    }
  };

  const handleItemLayout = (value: string, frame: LayoutRectangle) => {
    layoutsRef.current[value] = frame;
    // Re-seat on every item layout so the pill (and the RTL mirror) reflects all
    // measured items, not just the first one to report.
    movePillTo(selectedValue, false);
  };

  const handleSelect = (value: string) => {
    if (isFloating) {
      movePillTo(value, true);
    }
    onSelect(value);
  };

  // Keep the pill in sync with the selected tab even when it changes without a
  // tap (back gesture, deep link, programmatic nav) so it never desyncs from
  // the icon/label colours.
  useEffect(() => {
    if (isFloating) {
      movePillTo(selectedValue, true);
    }
    // movePillTo is recreated each render; we intentionally track selectedValue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedValue]);

  const pillAnimatedStyle = useAnimatedStyle(() => ({
    left: pillX.value,
    width: pillWidth.value,
  }));

  return (
    <View
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      onLayout={isFloating ? handleRootLayout : undefined}
      style={[styles.root, style]}>
      {isFloating && pillReady ? (
        <Animated.View
          testID="ui-bottom-nav-pill"
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
