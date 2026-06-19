import React, {useContext} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {SafeAreaView} from 'react-native-safe-area-context';

import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';
import type {Theme} from '../../utils/types';

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing.l,
    },
    title: {
      ...theme.typography.headlineH1,
      color: theme.colors.onBackground,
    },
  });

export const ExploreScreen: React.FC = () => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = useContext(L10nContext);
  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={['top']}
      testID="explore-screen">
      <View style={styles.container}>
        <Text style={styles.title}>{l10n.tabs.explore}</Text>
      </View>
    </SafeAreaView>
  );
};
