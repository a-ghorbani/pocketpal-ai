import React from 'react';
import {View, Text, StyleSheet, Pressable} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {Stepper} from '../../../components/ui';
import {useTheme} from '../../../hooks';
import type {Theme} from '../../../utils/types';

export type OnboardingScaffoldProps = {
  /** 1-based screen index used for the testID and Stepper. */
  step: 1 | 2 | 3 | 4 | 5 | 6;
  showStepper: boolean;
  showSkip: boolean;
  onSkip?: () => void;
  skipLabel: string;
  eyebrow?: string;
  title: string;
  body?: string;
  children?: React.ReactNode;
  bottom?: React.ReactNode;
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.l,
      paddingTop: theme.spacing.m,
      paddingBottom: theme.spacing.s,
      minHeight: 48,
    },
    headerSpacer: {flex: 1},
    skip: {
      paddingHorizontal: theme.spacing.s,
      paddingVertical: theme.spacing.xs,
    },
    skipText: {
      ...theme.typography.uiS,
      color: theme.colors.onSurfaceVariant,
    },
    content: {
      flex: 1,
      paddingHorizontal: theme.spacing.l,
      paddingTop: theme.spacing.xl,
    },
    eyebrow: {
      ...theme.typography.uiS,
      color: theme.colors.onSurfaceVariant,
      marginBottom: theme.spacing.s,
    },
    title: {
      ...theme.typography.headlineH1,
      color: theme.colors.onBackground,
      marginBottom: theme.spacing.m,
    },
    body: {
      ...theme.typography.bodyM,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.l,
    },
    bottom: {
      paddingHorizontal: 0,
      paddingBottom: theme.spacing.m,
    },
  });

export const OnboardingScaffold: React.FC<OnboardingScaffoldProps> = ({
  step,
  showStepper,
  showSkip,
  onSkip,
  skipLabel,
  eyebrow,
  title,
  body,
  children,
  bottom,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <SafeAreaView
      testID={`onboarding-screen-${step}`}
      style={styles.root}
      edges={['top', 'bottom']}>
      <View style={styles.header}>
        {showStepper ? <Stepper total={4} current={step} /> : <View />}
        {showSkip ? (
          <Pressable
            testID="onboarding-skip"
            accessibilityRole="button"
            accessibilityLabel={skipLabel}
            onPress={onSkip}
            style={styles.skip}>
            <Text style={styles.skipText}>{skipLabel}</Text>
          </Pressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>
      <View style={styles.content}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {body ? <Text style={styles.body}>{body}</Text> : null}
        {children}
      </View>
      {bottom ? <View style={styles.bottom}>{bottom}</View> : null}
    </SafeAreaView>
  );
};
