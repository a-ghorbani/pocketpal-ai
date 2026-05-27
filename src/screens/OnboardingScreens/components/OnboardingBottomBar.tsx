import React from 'react';
import {StyleSheet, View} from 'react-native';

import {Button, IconButton} from '../../../components/ui';
import {ChevronRightIcon} from '../../../assets/icons';
import {useTheme} from '../../../hooks';
import type {Theme} from '../../../utils/types';

export type OnboardingBottomBarProps = {
  /** Visible label on the primary button. Pass the bare copy without arrow. */
  primaryLabel: string;
  /** Optional trailing glyph (downward arrow on screen 6). */
  primaryTrailing?: React.ReactNode;
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
    backIcon: {
      transform: [{rotate: '180deg'}],
    },
  });

export const OnboardingBottomBar: React.FC<OnboardingBottomBarProps> = ({
  primaryLabel,
  primaryTrailing,
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
          icon={
            <ChevronRightIcon
              width={20}
              height={20}
              stroke={theme.colors.onBackground}
              style={styles.backIcon}
            />
          }
          onPress={onBack}
        />
      ) : null}
      <Button
        testID="onboarding-primary"
        label={primaryLabel}
        disabled={primaryDisabled}
        onPress={onPrimary}
        style={styles.primary}>
        {primaryTrailing}
      </Button>
    </View>
  );
};
