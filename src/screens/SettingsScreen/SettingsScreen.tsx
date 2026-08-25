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
import {authService} from '../../services';

import {RootStackParamList} from '../../utils/types';
import {ROUTES} from '../../utils/navigationConstants';
import {L10nContext} from '../../utils';
import {t} from '../../locales';

type LauncherIcon = React.FC<{
  width?: number;
  height?: number;
  stroke?: string;
}>;

export const SettingsScreen: React.FC = observer(() => {
  const l10n = useContext(L10nContext);
  const theme = useTheme();
  const styles = createStyles(theme);
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();

  const isRegistered = authService.isAuthenticated;
  const user = authService.user;
  const profile = authService.profile;
  const displayName =
    profile?.full_name ??
    profile?.username ??
    user?.user_metadata?.full_name ??
    user?.email?.split('@')[0];
  const memberSinceYear = user?.created_at
    ? new Date(user.created_at).getFullYear()
    : undefined;

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
    {
      testID: 'settings-nav-account-settings',
      onPress: () =>
        navigation.navigate(
          isRegistered ? ROUTES.ACCOUNT : ROUTES.ACCOUNT_LOGIN,
        ),
    },
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        {isRegistered ? (
          <View style={styles.headerRegistered}>
            <Text style={styles.welcome}>
              {displayName
                ? t(l10n.settings.launcher.welcome, {name: displayName})
                : l10n.settings.launcher.welcomeNoName}
            </Text>
            {memberSinceYear !== undefined &&
            Number.isFinite(memberSinceYear) ? (
              <Text style={styles.memberSince}>
                {t(l10n.settings.launcher.memberSince, {
                  year: memberSinceYear,
                })}
              </Text>
            ) : null}
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
              style={styles.ctaButton}
              label={l10n.settings.launcher.createAccountButton}
              accessibilityLabel={l10n.settings.launcher.createAccountButton}
              onPress={() => navigation.navigate(ROUTES.ACCOUNT_SIGN_UP)}
            />
            <Text style={styles.ctaLoginPrompt}>
              {l10n.settings.launcher.logInPrompt}{' '}
              <Text
                testID="settings-log-in"
                accessibilityRole="button"
                style={styles.ctaLoginLink}
                onPress={() => navigation.navigate(ROUTES.ACCOUNT_LOGIN)}>
                {l10n.settings.launcher.logIn}
              </Text>
            </Text>
          </View>
        )}

        <View style={styles.group}>
          {isRegistered &&
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
          {isRegistered && accountSettingsRow}
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
          {!isRegistered && accountSettingsRow}
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

        {isRegistered && (
          <Button
            testID="settings-log-out"
            variant="secondary"
            style={styles.logOut}
            label={l10n.settings.launcher.logOut}
            accessibilityLabel={l10n.settings.launcher.logOut}
            onPress={() => authService.signOut()}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
});
