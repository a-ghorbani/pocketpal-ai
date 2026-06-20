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
 * Pill translateX relative to its logical `start` anchor (left in LTR, right in
 * RTL). `onLayout` reports a physical-left `x`; in RTL we mirror it and shift
 * the pill leftward from the start (right) edge so the highlight lands on the
 * correct tab on both platforms.
 */
export const pillTranslateX = (
  frameX: number,
  frameWidth: number,
  containerWidth: number,
  isRTL: boolean,
): number => {
  const x = isRTL ? -(containerWidth - frameX - frameWidth) : frameX;
  // Normalise -0 to 0 (identical translate; keeps equality checks clean).
  return x === 0 ? 0 : x;
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

  const movePillTo = (value: string, animated: boolean) => {
    const frame = layoutsRef.current[value];
    // RTL positioning is relative to the container's right edge, so the pill
    // can only be seated once the container width is known.
    if (!frame || (isRTL && !containerWidthRef.current)) {
      return;
    }
    const x = pillTranslateX(
      frame.x,
      frame.width,
      containerWidthRef.current,
      isRTL,
    );
    if (animated) {
      pillX.value = withTiming(x, PILL_TIMING);
      pillWidth.value = withTiming(frame.width, PILL_TIMING);
    } else {
      pillX.value = x;
      pillWidth.value = frame.width;
    }
    if (!pillReady) {
      setPillReady(true);
    }
  };

  const handleRootLayout = (e: LayoutChangeEvent) => {
    containerWidthRef.current = e.nativeEvent.layout.width;
    // In RTL the first seat may have been deferred until the width was known.
    if (isFloating) {
      movePillTo(selectedValue, false);
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
    transform: [{translateX: pillX.value}],
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
