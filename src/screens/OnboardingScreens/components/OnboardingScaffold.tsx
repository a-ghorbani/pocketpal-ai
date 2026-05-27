import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import {SafeAreaView} from 'react-native-safe-area-context';

import {Stepper} from '../../../components/ui';
import {useTheme} from '../../../hooks';
import type {Theme} from '../../../utils/types';

export type OnboardingScaffoldProps = {
  /** 1-based screen index used for the testID and Stepper. */
  step: 1 | 2 | 3 | 4 | 5 | 6;
  /** Show the 4-dot Stepper (screens 1–4 only). */
  showStepper: boolean;
  /** Top-right slot — typically Skip (1–4) or AudioButton (5+6). */
  topRight?: React.ReactNode;
  /** Top-left slot — typically the screen-5 in-header Back chevron. */
  topLeft?: React.ReactNode;
  /** Optional illustration block rendered between header and content. */
  illustration?: React.ReactNode;
  /** Title — may be a `<Text>` tree (for nested italic accents). */
  title: React.ReactNode;
  /** Body — may be a `<Text>` or `<HighlightText>` tree. */
  body?: React.ReactNode;
  /** Children render after the body — chip grids, model groups, etc. */
  children?: React.ReactNode;
  /** Bottom bar (Back + primary). Null on screen 5. */
  bottomBar?: React.ReactNode;
  /** Title alignment (screen 5 centers). */
  titleAlign?: 'left' | 'center';
};

const createStyles = (theme: Theme, titleAlign: 'left' | 'center') =>
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
    headerSlot: {
      minWidth: 48,
      alignItems: 'center',
    },
    headerCenter: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    illustration: {
      paddingHorizontal: theme.spacing.l,
      paddingTop: theme.spacing.m,
      alignItems: 'center',
    },
    content: {
      flex: 1,
      paddingHorizontal: theme.spacing.l,
      paddingTop: theme.spacing.l,
    },
    title: {
      ...theme.typography.headlineH1,
      color: theme.colors.onBackground,
      marginBottom: theme.spacing.m,
      textAlign: titleAlign,
    },
    body: {
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
  topRight,
  topLeft,
  illustration,
  title,
  body,
  children,
  bottomBar,
  titleAlign = 'left',
}) => {
  const theme = useTheme();
  const styles = createStyles(theme, titleAlign);
  return (
    <SafeAreaView
      testID={`onboarding-screen-${step}`}
      style={styles.root}
      edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerSlot}>{topLeft}</View>
        <View style={styles.headerCenter}>
          {showStepper ? <Stepper total={4} current={step} /> : null}
        </View>
        <View style={styles.headerSlot}>{topRight}</View>
      </View>
      {illustration ? (
        <View style={styles.illustration}>{illustration}</View>
      ) : null}
      <View style={styles.content}>
        {typeof title === 'string' ? (
          <Text style={styles.title}>{title}</Text>
        ) : (
          <Text style={styles.title}>{title}</Text>
        )}
        {body ? <View style={styles.body}>{body}</View> : null}
        {children}
      </View>
      {bottomBar ? <View style={styles.bottom}>{bottomBar}</View> : null}
    </SafeAreaView>
  );
};
