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
      paddingHorizontal: theme.spacing.s,
      paddingVertical: theme.spacing.xs,
    },
    label: {
      ...theme.typography.uiS,
      color: theme.colors.onSurfaceVariant,
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
