import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';

import {SplashMark} from '../../assets/onboarding/illustrations';
import {useTheme} from '../../hooks';
import type {Theme} from '../../utils/types';
import {ROUTES} from '../../utils/navigationConstants';

const SPLASH_MIN_DWELL_MS = 600;

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      // Figma `Color/Background/Muted` (#fafafa) — maps to
      // `colors.surfaceVariant` per WHAT §4h.
      backgroundColor: theme.colors.surfaceVariant,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });

/**
 * Brand splash — post-hydration, pre-Onboarding-1. Renders the
 * 112×112 mark from Figma `884:28352` then transitions after
 * `SPLASH_MIN_DWELL_MS`.
 */
export const SplashScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const theme = useTheme();
  const styles = createStyles(theme);

  React.useEffect(() => {
    const t = setTimeout(() => {
      navigation.navigate(ROUTES.ONBOARDING.STEP_1);
    }, SPLASH_MIN_DWELL_MS);
    return () => clearTimeout(t);
  }, [navigation]);

  return (
    <View testID="onboarding-splash" style={styles.root}>
      <SplashMark
        width={112}
        height={112}
        accessibilityLabel="Pocket Pal"
        accessibilityRole="image"
      />
    </View>
  );
};
