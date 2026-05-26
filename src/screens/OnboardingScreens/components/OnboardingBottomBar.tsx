import React from 'react';
import {View, StyleSheet} from 'react-native';

import {Button, IconButton} from '../../../components/ui';
import {useTheme} from '../../../hooks';
import type {Theme} from '../../../utils/types';

export type OnboardingBottomBarProps = {
  primaryLabel: string;
  primaryDisabled?: boolean;
  onPrimary: () => void;
  showBack?: boolean;
  onBack?: () => void;
  backAccessibilityLabel: string;
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.l,
      paddingVertical: theme.spacing.m,
      gap: theme.spacing.s,
    },
    primary: {
      flex: 1,
    },
  });

export const OnboardingBottomBar: React.FC<OnboardingBottomBarProps> = ({
  primaryLabel,
  primaryDisabled,
  onPrimary,
  showBack = true,
  onBack,
  backAccessibilityLabel,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <View style={styles.root}>
      {showBack ? (
        <IconButton
          testID="onboarding-back"
          accessibilityLabel={backAccessibilityLabel}
          icon={null}
          onPress={onBack}
        />
      ) : null}
      <Button
        testID="onboarding-primary"
        label={primaryLabel}
        disabled={primaryDisabled}
        onPress={onPrimary}
        style={styles.primary}
      />
    </View>
  );
};
