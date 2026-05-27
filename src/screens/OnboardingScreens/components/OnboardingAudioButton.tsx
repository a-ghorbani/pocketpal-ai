import React from 'react';
import {AccessibilityInfo, Pressable, StyleSheet} from 'react-native';

import {HeadphonesGlyph} from '../../../assets/onboarding/illustrations';
import {useTheme} from '../../../hooks';
import type {Theme} from '../../../utils/types';

export type OnboardingAudioButtonProps = {
  /** Screen title text — first half of the announcement. */
  titleText: string;
  /** Screen body text — second half of the announcement. */
  bodyText: string;
  /** Accessibility label (l10n-keyed by the consumer). */
  accessibilityLabel: string;
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      // Figma `884:28301` Audio: 40×40 IconButton with secondary
      // default bg, border light-grey, radius m=12, padding sm/ml.
      width: 40,
      height: 40,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.ml,
      borderRadius: theme.radius.m,
      borderWidth: theme.stroke.sm,
      borderColor: theme.colors.outlineVariant,
      backgroundColor: theme.colors.secondaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });

/**
 * Side-effect-only button shown in the top-right header slot of
 * screens 5 + 6. On press, pushes the title + body into the platform
 * screen-reader queue via AccessibilityInfo.announceForAccessibility.
 *
 * If no screen reader is active, the call is a silent no-op (matches
 * the RN documented contract). No app state, no TTS engine.
 */
export const OnboardingAudioButton: React.FC<OnboardingAudioButtonProps> = ({
  titleText,
  bodyText,
  accessibilityLabel,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const onPress = () => {
    AccessibilityInfo.announceForAccessibility(`${titleText} ${bodyText}`);
  };
  return (
    <Pressable
      testID="onboarding-audio"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={styles.root}>
      <HeadphonesGlyph
        width={16}
        height={16}
        fill={theme.colors.onBackground}
      />
    </Pressable>
  );
};
