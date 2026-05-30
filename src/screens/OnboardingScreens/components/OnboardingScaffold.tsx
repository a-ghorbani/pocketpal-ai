import React from 'react';
import {StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {useTheme} from '../../../hooks';
import type {Theme} from '../../../utils/types';

export type OnboardingScaffoldProps = {
  /** 1-based screen index used for the testID. */
  step: 1 | 2 | 3 | 4 | 5 | 6;
  /** Top-left slot — screen-5 in-header Back chevron (only consumer). */
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
      // Figma `Color/Background/Muted` (#fafafa) is the canvas. Our
      // closest token is `surface` (#F9FAFB). The previous binding to
      // `surfaceVariant` (#e4e4e6) was too dark and caused the muted
      // stepper dots (#e5e3e1) to blend into the background.
      backgroundColor: theme.colors.surface,
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
        {topLeft ? <View style={styles.topLeftSlot}>{topLeft}</View> : null}
        {illustration}
        {content}
      </View>
      {bottomBar ? <View style={styles.bottom}>{bottomBar}</View> : null}
    </SafeAreaView>
  );
};
