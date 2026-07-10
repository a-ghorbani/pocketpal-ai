import React from 'react';
import {Pressable} from 'react-native';

import {ChevronLeftLgIcon} from '../../../../assets/icons';
import {useTheme} from '../../../../hooks';
import {createStyles} from './styles';

export type OnboardingBackButtonProps = {
  onPress: () => void;
  accessibilityLabel: string;
};

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
