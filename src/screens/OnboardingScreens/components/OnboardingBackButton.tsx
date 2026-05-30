import React from 'react';
import {Pressable, StyleSheet} from 'react-native';

import {ChevronLeftLgIcon} from '../../../assets/icons';
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
      // bg Color/Secondary/Default (#f3f2f2), border 0.5 Color/Border/
      // Light-grey (#e5e3e1).
      width: 48,
      height: 48,
      borderRadius: theme.radius.ml,
      borderWidth: theme.stroke.sm,
      borderColor: theme.colors.mutedLight,
      backgroundColor: theme.colors.secondaryDefault,
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
      {/* Figma chevron-left lg — native 6.5×11.5. */}
      <ChevronLeftLgIcon width={6.5} height={11.5} />
    </Pressable>
  );
};
