import React, {useContext} from 'react';
import {View, ScrollView, Pressable} from 'react-native';

import {observer} from 'mobx-react-lite';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {Text} from 'react-native-paper';

import {
  UserCircleIcon,
  SmileMdIcon,
  SettingsIcon,
  BenchmarkIcon,
  ModelIcon,
  AppInfoIcon,
  CpuChipIcon,
  ChevronRightIcon,
} from '../../assets/icons';

import {Button} from '../../components/ui/Button';

import {useTheme} from '../../hooks';

import {createStyles} from './styles';

import {palStore} from '../../store';

import {RootStackParamList} from '../../utils/types';
import {ROUTES} from '../../utils/navigationConstants';
import {L10nContext} from '../../utils';
import {t} from '../../locales';

type LauncherIcon = React.FC<{
  width?: number;
  height?: number;
  stroke?: string;
}>;

// Auth-driven launcher header is wired in a later slice; the root defaults to
// the not-registered variant and never reads account state on this branch.
const IS_REGISTERED = false;

export const SettingsScreen: React.FC = observer(() => {
  const l10n = useContext(L10nContext);
  const theme = useTheme();
  const styles = createStyles(theme);
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();

  const renderRow = (
    RowIcon: LauncherIcon,
    title: string,
    subtitle: string,
    options: {testID: string; onPress?: () => void; inert?: boolean},
  ) => (
    <Pressable
      testID={options.testID}
      onPress={options.inert ? undefined : options.onPress}
      disabled={options.inert}
      style={styles.rowPressable}>
      <View style={[styles.row, options.inert && styles.rowInert]}>
        <RowIcon width={20} height={20} stroke={theme.colors.onSurface} />
        <View style={styles.rowTextContainer}>
          <Text style={styles.rowTitle}>{title}</Text>
          <Text style={styles.rowSubtitle}>{subtitle}</Text>
        </View>
        <ChevronRightIcon
          width={20}
          height={20}
          stroke={theme.colors.onSurfaceVariant}
        />
      </View>
    </Pressable>
  );

  const accountSettingsRow = renderRow(
    UserCircleIcon,
    l10n.settings.launcher.accountSettings,
    l10n.settings.launcher.accountSettingsSubtitle,
    {testID: 'settings-nav-account-settings', inert: true},
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        {IS_REGISTERED ? (
          <View style={styles.headerRegistered}>
            <Text style={styles.welcome}>
              {t(l10n.settings.launcher.welcome, {name: ''})}
            </Text>
            <Text style={styles.memberSince}>
              {t(l10n.settings.launcher.memberSince, {year: ''})}
            </Text>
          </View>
        ) : (
          <View style={styles.ctaCard}>
            <View style={styles.avatar}>
              <UserCircleIcon
                width={28}
                height={28}
                stroke={theme.colors.onPrimary}
              />
            </View>
            <Text style={styles.ctaTitle}>
              {l10n.settings.launcher.createAccountTitle}
            </Text>
            <Text style={styles.ctaDescription}>
              {l10n.settings.launcher.createAccountDescription}
            </Text>
            <Button
              testID="settings-create-account"
              variant="secondary"
              disabled
              style={styles.ctaButton}
              label={l10n.settings.launcher.createAccountButton}
              accessibilityLabel={l10n.settings.launcher.createAccountButton}
            />
          </View>
        )}

        <View style={styles.group}>
          {IS_REGISTERED &&
            renderRow(
              SmileMdIcon,
              l10n.settings.launcher.myPals,
              t(l10n.settings.launcher.myPalsSubtitle, {
                count: palStore.pals.length.toString(),
              }),
              {
                testID: 'settings-nav-my-pals',
                onPress: () => navigation.navigate(ROUTES.PALS),
              },
            )}
          {IS_REGISTERED && accountSettingsRow}
          {renderRow(
            SettingsIcon,
            l10n.settings.launcher.preferences,
            l10n.settings.launcher.preferencesSubtitle,
            {
              testID: 'settings-nav-preferences',
              onPress: () => navigation.navigate(ROUTES.PREFERENCES),
            },
          )}
          {renderRow(
            BenchmarkIcon,
            l10n.settings.launcher.benchmark,
            l10n.settings.launcher.benchmarkSubtitle,
            {
              testID: 'settings-nav-benchmark',
              onPress: () => navigation.navigate(ROUTES.BENCHMARK),
            },
          )}
          {renderRow(
            ModelIcon,
            l10n.settings.launcher.models,
            l10n.settings.launcher.modelsSubtitle,
            {
              testID: 'settings-nav-models',
              onPress: () => navigation.navigate(ROUTES.MODELS),
            },
          )}
          {renderRow(
            CpuChipIcon,
            l10n.settings.launcher.appSettings,
            l10n.settings.launcher.appSettingsSubtitle,
            {
              testID: 'settings-nav-app-settings',
              onPress: () => navigation.navigate(ROUTES.APP_SETTINGS),
            },
          )}
          {renderRow(
            AppInfoIcon,
            l10n.settings.launcher.aboutApp,
            l10n.settings.launcher.aboutAppSubtitle,
            {
              testID: 'settings-nav-app-info',
              onPress: () => navigation.navigate(ROUTES.APP_INFO),
            },
          )}
          {!IS_REGISTERED && accountSettingsRow}
          {__DEV__ &&
            renderRow(
              CpuChipIcon,
              l10n.settings.devTools,
              l10n.settings.advancedSection,
              {
                testID: 'settings-nav-dev-tools',
                onPress: () => navigation.navigate(ROUTES.DEV_TOOLS),
              },
            )}
        </View>

        {IS_REGISTERED && (
          <Button
            testID="settings-log-out"
            variant="secondary"
            style={styles.logOut}
            label={l10n.settings.launcher.logOut}
            accessibilityLabel={l10n.settings.launcher.logOut}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
});
