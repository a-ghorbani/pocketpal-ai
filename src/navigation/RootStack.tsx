import React, {useContext} from 'react';
import {StyleSheet} from 'react-native';

import {createStackNavigator} from '@react-navigation/stack';
import {gestureHandlerRootHOC} from 'react-native-gesture-handler';

import {useTheme} from '../hooks';
import {L10nContext} from '../utils';
import {ROUTES} from '../utils/navigationConstants';
import type {RootStackParamList, Theme} from '../utils/types';
import {ModelsHeaderRight, PalHeaderRight} from '../components';
import {
  ChatScreen,
  ModelsScreen,
  BenchmarkScreen,
  AboutScreen,
  PreferencesScreen,
  AppSettingsScreen,
  DevToolsScreen,
} from '../screens';
import PalsScreen from '../screens/PalsScreen';

import {MainTabs} from './MainTabs';

export const Stack = createStackNavigator<RootStackParamList>();

const isDebugMode = __DEV__;

type RootStackProps = {
  // E2E-only automation routes are injected by the app root, which is the
  // only place allowed to import from src/__automation__/.
  renderAutomationScreens?: () => React.ReactNode;
};

export const RootStack: React.FC<RootStackProps> = ({
  renderAutomationScreens,
}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);

  return (
    <Stack.Navigator
      initialRouteName="MainTabs"
      screenOptions={{
        headerStyle: styles.headerWithoutDivider,
        headerTintColor: theme.colors.onBackground,
        headerTitleStyle: styles.headerTitle,
        headerBackButtonDisplayMode: 'minimal',
      }}>
      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{headerShown: false}}
      />
      <Stack.Screen
        name={ROUTES.CHAT}
        component={gestureHandlerRootHOC(ChatScreen)}
        options={{headerShown: false}}
      />
      <Stack.Screen
        name={ROUTES.PALS}
        component={gestureHandlerRootHOC(PalsScreen)}
        options={{
          headerRight: () => <PalHeaderRight />,
          title: l10n.screenTitles.pals,
        }}
      />
      <Stack.Screen
        name={ROUTES.MODELS}
        component={gestureHandlerRootHOC(ModelsScreen)}
        options={{
          headerRight: () => <ModelsHeaderRight />,
          title: l10n.screenTitles.models,
        }}
      />
      <Stack.Screen
        name={ROUTES.PREFERENCES}
        component={gestureHandlerRootHOC(PreferencesScreen)}
        options={{title: l10n.screenTitles.preferences}}
      />
      <Stack.Screen
        name={ROUTES.APP_SETTINGS}
        component={gestureHandlerRootHOC(AppSettingsScreen)}
        options={{title: l10n.screenTitles.appSettings}}
      />
      <Stack.Screen
        name={ROUTES.BENCHMARK}
        component={gestureHandlerRootHOC(BenchmarkScreen)}
        options={{title: l10n.screenTitles.benchmark}}
      />
      <Stack.Screen
        name={ROUTES.APP_INFO}
        component={gestureHandlerRootHOC(AboutScreen)}
        options={{title: l10n.screenTitles.appInfo}}
      />

      {isDebugMode && (
        <Stack.Screen
          name={ROUTES.DEV_TOOLS}
          component={gestureHandlerRootHOC(DevToolsScreen)}
          options={{title: 'Dev Tools'}}
        />
      )}

      {renderAutomationScreens?.()}
    </Stack.Navigator>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    headerWithoutDivider: {
      elevation: 0,
      shadowOpacity: 0,
      borderBottomWidth: 0,
      backgroundColor: theme.colors.background,
    },
    headerTitle: {
      ...theme.fonts.titleSmall,
    },
  });
