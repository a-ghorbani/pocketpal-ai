import React from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';

import {useTheme} from '../../../hooks';
import type {Theme} from '../../../utils/types';

export type OnboardingSkipButtonProps = {
  label: string;
  onPress: () => void;
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      // Figma `884:32492` Buttons (Skip) — pill, padding xxs, radius
      // m, height 28. Background is transparent so it floats over
      // the body bg.
      height: 28,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: theme.spacing.none,
      borderRadius: theme.radius.m,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      ...theme.typography.titleS,
      color: theme.colors.onBackground,
    },
  });

export const OnboardingSkipButton: React.FC<OnboardingSkipButtonProps> = ({
  label,
  onPress,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <Pressable
      testID="onboarding-skip"
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.root}>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
};
