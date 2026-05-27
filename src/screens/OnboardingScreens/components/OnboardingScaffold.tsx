import React from 'react';
import {StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {Stepper} from '../../../components/ui';
import {useTheme} from '../../../hooks';
import type {Theme} from '../../../utils/types';

export type OnboardingScaffoldProps = {
  /** 1-based screen index used for the testID and Stepper. */
  step: 1 | 2 | 3 | 4 | 5 | 6;
  /** Show the 4-dot Stepper (screens 1–4 only). */
  showStepper: boolean;
  /** Top-right slot — Skip (1–4) or AudioButton (5+6). */
  topRight?: React.ReactNode;
  /** Top-left slot — typically the screen-5 in-header Back chevron. */
  topLeft?: React.ReactNode;
  /**
   * Hero visual block rendered between the header band and the
   * `content` block. Centered in the body's vertical free space.
   */
  illustration?: React.ReactNode;
  /**
   * `content` slot — eyebrow + title + body + any additional
   * children (chip grid, model radios, etc). Centered as a single
   * block under the illustration.
   */
  content: React.ReactNode;
  /** Bottom bar (Back + primary). Null on screen 5. */
  bottomBar?: React.ReactNode;
  /**
   * Lay the body in the figma-default "centered" vertical-justify
   * mode (screens 1–4) or in the screen-5/6 "top-anchored" mode
   * (Figma uses `pt-xxl` and lets content flow from the top).
   */
  layout?: 'centered' | 'top';
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      // Figma `Color/Background/Muted` (#fafafa) is the canvas. Maps
      // to `colors.surfaceVariant` per the WHAT §4h binding.
      backgroundColor: theme.colors.surfaceVariant,
    },
    body: {
      flex: 1,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.m,
      position: 'relative',
    },
    bodyCentered: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.xl,
    },
    bodyTop: {
      alignItems: 'center',
      paddingTop: theme.spacing.xxl,
      gap: theme.spacing.ml,
    },
    // Figma positions the Stepper at `x=137, y=30, w=120` — horizontally
    // centered on a 393pt frame, 30pt from the body top.
    stepperSlot: {
      position: 'absolute',
      top: 30,
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 1,
    },
    stepperOverride: {
      // Override the Stepper DS's `alignSelf: 'flex-start'` default —
      // Figma positions the dot row horizontally centered on a 393pt
      // frame. Wrapping in a centered slot isn't enough because the
      // child's alignSelf wins over the parent's alignItems.
      alignSelf: 'center',
    },
    topRightSlot: {
      position: 'absolute',
      top: 16,
      right: 16,
      zIndex: 2,
    },
    topLeftSlot: {
      position: 'absolute',
      top: 16,
      left: 16,
      zIndex: 2,
    },
    bottom: {
      paddingHorizontal: 0,
    },
  });

export const OnboardingScaffold: React.FC<OnboardingScaffoldProps> = ({
  step,
  showStepper,
  topRight,
  topLeft,
  illustration,
  content,
  bottomBar,
  layout = 'centered',
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <SafeAreaView
      testID={`onboarding-screen-${step}`}
      style={styles.root}
      edges={['top', 'bottom']}>
      <View
        style={[
          styles.body,
          layout === 'centered' ? styles.bodyCentered : styles.bodyTop,
        ]}>
        {showStepper ? (
          <View pointerEvents="none" style={styles.stepperSlot}>
            <Stepper total={4} current={step} style={styles.stepperOverride} />
          </View>
        ) : null}
        {topLeft ? <View style={styles.topLeftSlot}>{topLeft}</View> : null}
        {topRight ? <View style={styles.topRightSlot}>{topRight}</View> : null}
        {illustration}
        {content}
      </View>
      {bottomBar ? <View style={styles.bottom}>{bottomBar}</View> : null}
    </SafeAreaView>
  );
};
