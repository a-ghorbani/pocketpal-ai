import React from 'react';
import {Pressable, StyleSheet} from 'react-native';

import {ChevronLeftGlyph} from '../../../assets/onboarding/illustrations';
import {useTheme} from '../../../hooks';
import type {Theme} from '../../../utils/types';

export type OnboardingBackButtonProps = {
  onPress: () => void;
  accessibilityLabel: string;
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      // Figma `888:33641` Buttons (Back): 48×48, radius ml=16,
      // bg secondary/default, border 0.5 light-grey.
      width: 48,
      height: 48,
      borderRadius: theme.radius.ml,
      borderWidth: theme.stroke.sm,
      borderColor: theme.colors.outlineVariant,
      backgroundColor: theme.colors.secondaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });

/**
 * Top-left header Back chevron — used on screen 5 (no bottom bar).
 * Other screens render Back inside `OnboardingBottomBar`. Both
 * render under the same `onboarding-back` testID.
 */
export const OnboardingBackButton: React.FC<OnboardingBackButtonProps> = ({
  onPress,
  accessibilityLabel,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <Pressable
      testID="onboarding-back"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={styles.root}>
      <ChevronLeftGlyph
        width={12}
        height={20}
        fill={theme.colors.onBackground}
      />
    </Pressable>
  );
};
