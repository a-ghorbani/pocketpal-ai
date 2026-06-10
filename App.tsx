import * as React from 'react';
import {Appearance, Dimensions, StyleSheet, View} from 'react-native';

import {observer} from 'mobx-react';
import {isHydrated} from 'mobx-persist-store';
import {NavigationContainer} from '@react-navigation/native';
import {Provider as PaperProvider} from 'react-native-paper';
import {BottomSheetModalProvider} from '@gorhom/bottom-sheet';
import {createDrawerNavigator} from '@react-navigation/drawer';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {KeyboardProvider} from 'react-native-keyboard-controller';
import {
  gestureHandlerRootHOC,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';

import {ttsStore, uiStore} from './src/store';
import {useTheme} from './src/hooks';
import {useDeepLinking} from './src/hooks/useDeepLinking';
import {Theme} from './src/utils/types';

import {l10n, initLocale} from './src/locales';
import {L10nContext} from './src/utils';
import {ROUTES} from './src/utils/navigationConstants';

import {
  SidebarContent,
  ModelsHeaderRight,
  PalHeaderRight,
  HeaderLeft,
  AppWithMigration,
  TTSSetupSheet,
  DownloadOverlay,
} from './src/components';
import {MarkdownProvider} from './src/components/MarkdownView';
import {AutomationBridge, BenchmarkRunnerScreen} from './src/__automation__';
import {
  ChatScreen,
  ModelsScreen,
  SettingsScreen,
  BenchmarkScreen,
  AboutScreen,

  // Dev tools screen. Only available in debug mode.
  DevToolsScreen,
} from './src/screens';
import PalsScreen from './src/screens/PalsScreen';
import {OnboardingStack} from './src/screens/OnboardingScreens';

// Check if app is in debug mode
const isDebugMode = __DEV__;

const Drawer = createDrawerNavigator();

const screenWidth = Dimensions.get('window').width;

// Component that handles deep linking - must be inside NavigationContainer
const DeepLinkHandler = () => {
  useDeepLinking();
  return null;
};

// Branches between the OnboardingStack (first-launch flow) and the main
// Drawer.Navigator. Both children mount under the same provider tree —
// switching does NOT remount providers above this point.
type SwitchPointProps = {drawer: React.ReactNode};
const SwitchPoint: React.FC<SwitchPointProps> = observer(({drawer}) => {
  if (!uiStore.hasCompletedOnboarding) {
    return <OnboardingStack />;
  }
  return <>{drawer}</>;
});

const App = observer(() => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const currentL10n = l10n[uiStore.language];

  // Initialize locale with the current language
  React.useEffect(() => {
    initLocale(uiStore.language);
  }, []);

  // Initialize TTS store (memory gate + AppState/session listeners).
  // Fire-and-forget: `init()` is idempotent and swallows its own errors.
  React.useEffect(() => {
    ttsStore.init().catch(() => {
      // init() swallows its own errors; catch to satisfy no-floating-promises.
    });
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      {__E2E__ ? <AutomationBridge /> : null}
      <SafeAreaProvider>
        <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
          <PaperProvider theme={theme}>
            <L10nContext.Provider value={currentL10n}>
              <MarkdownProvider>
                <NavigationContainer>
                  <DeepLinkHandler />
                  <BottomSheetModalProvider>
                    <SwitchPoint
                      drawer={
                        <Drawer.Navigator
                          screenOptions={{
                            headerLeft: () => <HeaderLeft />,
                            drawerStyle: {
                              width:
                                screenWidth > 400 ? 320 : screenWidth * 0.8,
                            },
                            headerStyle: {
                              backgroundColor: theme.colors.background,
                            },
                            headerTintColor: theme.colors.onBackground,
                            headerTitleStyle: styles.headerTitle,
                          }}
                          drawerContent={props => (
                            <SidebarContent {...props} />
                          )}>
                          <Drawer.Screen
                            name={ROUTES.CHAT}
                            component={gestureHandlerRootHOC(ChatScreen)}
                            options={{
                              headerShown: false,
                            }}
                          />
                          <Drawer.Screen
                            name={ROUTES.PALS}
                            component={gestureHandlerRootHOC(PalsScreen)}
                            options={{
                              headerRight: () => <PalHeaderRight />,
                              headerStyle: styles.headerWithoutDivider,
                              title: currentL10n.screenTitles.pals,
                            }}
                          />
                          <Drawer.Screen
                            name={ROUTES.MODELS}
                            component={gestureHandlerRootHOC(ModelsScreen)}
                            options={{
                              headerRight: () => <ModelsHeaderRight />,
                              headerStyle: styles.headerWithoutDivider,
                              title: currentL10n.screenTitles.models,
                            }}
                          />
                          <Drawer.Screen
                            name={ROUTES.BENCHMARK}
                            component={gestureHandlerRootHOC(BenchmarkScreen)}
                            options={{
                              headerStyle: styles.headerWithoutDivider,
                              title: currentL10n.screenTitles.benchmark,
                            }}
                          />
                          <Drawer.Screen
                            name={ROUTES.SETTINGS}
                            component={gestureHandlerRootHOC(SettingsScreen)}
                            options={{
                              headerStyle: styles.headerWithoutDivider,
                              title: currentL10n.screenTitles.settings,
                            }}
                          />
                          <Drawer.Screen
                            name={ROUTES.APP_INFO}
                            component={gestureHandlerRootHOC(AboutScreen)}
                            options={{
                              headerStyle: styles.headerWithoutDivider,
                              title: currentL10n.screenTitles.appInfo,
                            }}
                          />

                          {/* Only show Dev Tools screen in debug mode */}
                          {isDebugMode && (
                            <Drawer.Screen
                              name={ROUTES.DEV_TOOLS}
                              component={gestureHandlerRootHOC(DevToolsScreen)}
                              options={{
                                headerStyle: styles.headerWithoutDivider,
                                title: 'Dev Tools',
                              }}
                            />
                          )}

                          {/*
                      E2E-only deep-link-driven benchmark matrix runner.
                      Hidden from the drawer sidebar via
                      drawerItemStyle:{display:'none'}; reachable only by
                      the deep link pocketpal://e2e/benchmark in the e2e
                      flavor build (see useDeepLinking cold-launch effect
                      and android/app/src/e2e/AndroidManifest.xml).
                    */}
                          {__E2E__ && (
                            <Drawer.Screen
                              name={ROUTES.BENCHMARK_RUNNER}
                              component={gestureHandlerRootHOC(
                                BenchmarkRunnerScreen,
                              )}
                              options={{
                                headerStyle: styles.headerWithoutDivider,
                                title: 'Benchmark Runner',
                                drawerItemStyle: {display: 'none'},
                              }}
                            />
                          )}
                        </Drawer.Navigator>
                      }
                    />
                    <TTSSetupSheet />
                    <DownloadOverlay />
                  </BottomSheetModalProvider>
                </NavigationContainer>
              </MarkdownProvider>
            </L10nContext.Provider>
          </PaperProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
});

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
    },
    headerWithoutDivider: {
      elevation: 0,
      shadowOpacity: 0,
      borderBottomWidth: 0,
      backgroundColor: theme.colors.background,
    },
    headerWithDivider: {
      backgroundColor: theme.colors.background,
    },
    headerTitle: {
      ...theme.fonts.titleSmall,
    },
  });

// Neutral background-only hold, rendered until mobx-persist-store has
// loaded UIStore from AsyncStorage. It is a single full-screen View whose
// only meaningful property is backgroundColor, resolved from the system
// color scheme. Deliberately carries NO branding, NO Text, NO
// SafeAreaProvider, NO insets, and NO spinner: a flat colored View has
// nothing to match against either native launch surface (iOS has a branded
// storyboard, Android has no native launch screen), so it cannot diverge
// from native on any axis and reads simply as "app launching".
const splashStyles = StyleSheet.create({
  light: {flex: 1, backgroundColor: '#ffffff'},
  dark: {flex: 1, backgroundColor: '#000000'},
});

const HydrationHold = () => (
  <View
    testID="hydration-splash"
    style={
      Appearance.getColorScheme() === 'dark'
        ? splashStyles.dark
        : splashStyles.light
    }
  />
);

// Wrap the App component with AppWithMigration to show migration UI when
// needed. Gates the first render of any theme-consuming subtree on
// mobx-persist-store hydration so persisted `language` and `colorScheme`
// are observed on first paint.
//
// The gate must wrap App itself (App calls useTheme() BEFORE <PaperProvider>
// mounts), so AppWithMigrationWrapper — which sits above App and has no
// theme dependency — is the chosen host. While unhydrated it renders the
// neutral background-only hold above.
const AppWithMigrationWrapper = observer(() => {
  if (!isHydrated(uiStore)) {
    return <HydrationHold />;
  }
  return (
    <AppWithMigration>
      <App />
    </AppWithMigration>
  );
});

export default AppWithMigrationWrapper;
