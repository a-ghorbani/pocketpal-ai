import React, {useEffect} from 'react';
import {I18nManager, View} from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import {useTheme} from '../../../hooks';

import type {CommonDSProps} from '../types';

import {
  ACTIVE_DOT_WIDTH,
  DOT_HEIGHT,
  INACTIVE_DOT_WIDTH,
  createStyles,
} from './styles';

export type StepperProps = CommonDSProps & {
  /** Total number of steps. Must be >= 1. */
  total: number;
  /** 1-based active step. Clamped to [1, total]. */
  current: number;
};

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

// Duolingo-class pill slide: ~280ms ease-in-out feels confident without
// dragging when the user taps Next.
const ANIM_DURATION_MS = 280;
const WIDTH_DELTA = ACTIVE_DOT_WIDTH - INACTIVE_DOT_WIDTH;

type DotProps = {
  index: number;
  currentSV: SharedValue<number>;
  inactiveColor: string;
  activeColor: string;
  borderRadius: number;
  testID: string;
};

/**
 * One dot whose width + background derive from its distance to the
 * shared `currentSV`. When `currentSV` animates from old → new index,
 * the dot at the old index shrinks 48→20 while the dot at the new
 * index grows 20→48, which reads as the long pill sliding between
 * positions. Mid-transition (e.g. currentSV=1.5) both adjacent dots
 * are partially expanded so the total row width stays constant.
 */
const StepperDot: React.FC<DotProps> = ({
  index,
  currentSV,
  inactiveColor,
  activeColor,
  borderRadius,
  testID,
}) => {
  const animatedStyle = useAnimatedStyle(() => {
    const distance = Math.abs(index - currentSV.value);
    const t = Math.max(0, 1 - distance);
    return {
      width: INACTIVE_DOT_WIDTH + WIDTH_DELTA * t,
      backgroundColor: interpolateColor(
        t,
        [0, 1],
        [inactiveColor, activeColor],
      ),
      height: DOT_HEIGHT,
      borderRadius,
    };
  });
  return <Animated.View testID={testID} style={animatedStyle} />;
};

/**
 * DS Stepper. Pure presentational dot row indicating progress through a
 * bounded multi-step flow. The active dot is wider than the others and
 * smoothly slides between positions when `current` changes.
 *
 * Defaults: testID='ui-stepper', accessibilityRole='progressbar',
 * accessibilityValue={min:1, max:total, now:current}. Each dot exposes
 * testID='ui-stepper-dot-<i>' (1-based).
 *
 * RTL: row direction reverses when I18nManager.isRTL is true; dot index
 * order in the DOM is unchanged (testID-stable).
 */
export const Stepper: React.FC<StepperProps> = ({
  testID = 'ui-stepper',
  accessibilityLabel,
  accessibilityHint,
  style,
  total,
  current,
}) => {
  if (__DEV__) {
    if (total < 1) {
      console.warn(
        `[ui/Stepper] total must be >= 1; got ${total}. Clamping to 1.`,
      );
    }
    if (current < 1 || current > total) {
      console.warn(
        `[ui/Stepper] current=${current} out of range [1, ${total}]. Clamping.`,
      );
    }
  }
  const safeTotal = Math.max(1, total);
  const safeCurrent = clamp(current, 1, safeTotal);
  const isRTL = I18nManager.isRTL;
  const theme = useTheme();
  const styles = createStyles(theme, isRTL);
  const currentSV = useSharedValue(safeCurrent);
  useEffect(() => {
    currentSV.value = withTiming(safeCurrent, {
      duration: ANIM_DURATION_MS,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [safeCurrent, currentSV]);
  const dots: React.ReactNode[] = [];
  for (let i = 1; i <= safeTotal; i++) {
    dots.push(
      <StepperDot
        key={i}
        testID={`ui-stepper-dot-${i}`}
        index={i}
        currentSV={currentSV}
        inactiveColor={theme.colors.mutedLight}
        activeColor={theme.colors.primary}
        borderRadius={styles.dotBase.borderRadius as number}
      />,
    );
  }
  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={
        accessibilityLabel ?? `Step ${safeCurrent} of ${safeTotal}`
      }
      accessibilityHint={accessibilityHint}
      accessibilityValue={{min: 1, max: safeTotal, now: safeCurrent}}
      style={[styles.root, style]}>
      {dots}
    </View>
  );
};
