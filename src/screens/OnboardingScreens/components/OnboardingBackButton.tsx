import React from 'react';
import {StyleSheet} from 'react-native';

import {IconButton} from '../../../components/ui';
import {ChevronRightIcon} from '../../../assets/icons';
import {useTheme} from '../../../hooks';

export type OnboardingBackButtonProps = {
  onPress: () => void;
  accessibilityLabel: string;
};

const styles = StyleSheet.create({
  rotated: {transform: [{rotate: '180deg'}]},
});

/**
 * Top-left header Back chevron — used only on screen 5 (per design,
 * where there is no bottom bar). Other screens render Back inside the
 * `OnboardingBottomBar` instead. Both render under the same
 * `onboarding-back` testID.
 */
export const OnboardingBackButton: React.FC<OnboardingBackButtonProps> = ({
  onPress,
  accessibilityLabel,
}) => {
  const theme = useTheme();
  return (
    <IconButton
      testID="onboarding-back"
      accessibilityLabel={accessibilityLabel}
      icon={
        <ChevronRightIcon
          width={20}
          height={20}
          stroke={theme.colors.onBackground}
          style={styles.rotated}
        />
      }
      onPress={onPress}
    />
  );
};
