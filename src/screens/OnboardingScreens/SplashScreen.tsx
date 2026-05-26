import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {useNavigation} from '@react-navigation/native';

import {useTheme} from '../../hooks';
import type {Theme} from '../../utils/types';
import {ROUTES} from '../../utils/navigationConstants';

const SPLASH_MIN_DWELL_MS = 600;

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    brand: {
      ...theme.typography.headlineH1,
      color: theme.colors.onBackground,
    },
  });

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
      <Text style={styles.brand}>Pocket Pal</Text>
    </View>
  );
};
