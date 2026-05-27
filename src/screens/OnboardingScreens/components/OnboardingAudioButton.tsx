import React from 'react';
import {AccessibilityInfo} from 'react-native';

import {IconButton} from '../../../components/ui';
import {SpeakerIcon} from '../../../assets/icons';
import {useTheme} from '../../../hooks';

export type OnboardingAudioButtonProps = {
  /** Screen title text — first half of the announcement. */
  titleText: string;
  /** Screen body text — second half of the announcement. */
  bodyText: string;
  /** Accessibility label (l10n-keyed by the consumer). */
  accessibilityLabel: string;
};

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
  const onPress = () => {
    AccessibilityInfo.announceForAccessibility(`${titleText} ${bodyText}`);
  };
  return (
    <IconButton
      testID="onboarding-audio"
      accessibilityLabel={accessibilityLabel}
      icon={<SpeakerIcon width={20} height={20} stroke={theme.colors.text} />}
      onPress={onPress}
    />
  );
};
