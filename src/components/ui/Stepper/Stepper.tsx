import React from 'react';
import {I18nManager, View} from 'react-native';

import {useTheme} from '../../../hooks';

import type {CommonDSProps} from '../types';

import {createStyles} from './styles';

export type StepperProps = CommonDSProps & {
  /** Total number of steps. Must be >= 1. */
  total: number;
  /** 1-based active step. Clamped to [1, total]. */
  current: number;
};

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

/**
 * DS Stepper. Pure presentational dot row indicating progress through a
 * bounded multi-step flow. The active dot is wider than the others.
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
  const dots: React.ReactNode[] = [];
  for (let i = 1; i <= safeTotal; i++) {
    const active = i === safeCurrent;
    dots.push(
      <View
        key={i}
        testID={`ui-stepper-dot-${i}`}
        style={active ? styles.dotActive : styles.dotInactive}
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
