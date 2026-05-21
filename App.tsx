import * as React from 'react';
import {Appearance, Dimensions, StyleSheet, Text, View} from 'react-native';

import {observer} from 'mobx-react';
import {isHydrated} from 'mobx-persist-store';
import {NavigationContainer} from '@react-navigation/native';
import {Provider as PaperProvider} from 'react-native-paper';
import {BottomSheetModalProvider} from '@gorhom/bottom-sheet';
import {createDrawerNavigator} from '@react-navigation/drawer';
import {
  initialWindowMetrics,
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
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
} from './src/components';
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

// Check if app is in debug mode
const isDebugMode = __DEV__;

const Drawer = createDrawerNavigator();

const screenWidth = Dimensions.get('window').width;

// Component that handles deep linking - must be inside NavigationContainer
const DeepLinkHandler = () => {
  useDeepLinking();
  return null;
};

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
              <NavigationContainer>
                <DeepLinkHandler />
                <BottomSheetModalProvider>
                  <Drawer.Navigator
                    screenOptions={{
                      headerLeft: () => <HeaderLeft />,
                      drawerStyle: {
                        width: screenWidth > 400 ? 320 : screenWidth * 0.8,
                      },
                      headerStyle: {
                        backgroundColor: theme.colors.background,
                      },
                      headerTintColor: theme.colors.onBackground,
                      headerTitleStyle: styles.headerTitle,
                    }}
                    drawerContent={props => <SidebarContent {...props} />}>
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
                        component={gestureHandlerRootHOC(BenchmarkRunnerScreen)}
                        options={{
                          headerStyle: styles.headerWithoutDivider,
                          title: 'Benchmark Runner',
                          drawerItemStyle: {display: 'none'},
                        }}
                      />
                    )}
                  </Drawer.Navigator>
                  <TTSSetupSheet />
                </BottomSheetModalProvider>
              </NavigationContainer>
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

// Hydration splash — rendered until mobx-persist-store has loaded UIStore
// from AsyncStorage. Mirrors the native iOS launch screen
// (ios/PocketPal/LaunchScreen.storyboard): same system-background colour
// and the same two labels ("PocketPal" bold ~36, "LLM Ventures" near the
// bottom), using the platform system font (no custom font dependency).
// Matching the launch screen means the native-launch → JS-splash handoff
// is visually seamless instead of flashing to a blank screen.
const splashStyles = StyleSheet.create({
  container: {flex: 1, alignItems: 'center'},
  light: {backgroundColor: '#ffffff'},
  dark: {backgroundColor: '#000000'},
  title: {
    position: 'absolute',
    top: '30%',
    fontSize: 36,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  tagline: {
    position: 'absolute',
    fontSize: 17,
    textAlign: 'center',
  },
  textLight: {color: '#000000'},
  textDark: {color: '#ffffff'},
});

const HydrationSplashContent = () => {
  const isDark = Appearance.getColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const textStyle = isDark ? splashStyles.textDark : splashStyles.textLight;
  return (
    <View
      testID="hydration-splash"
      style={[
        splashStyles.container,
        isDark ? splashStyles.dark : splashStyles.light,
      ]}>
      <Text style={[splashStyles.title, textStyle]}>PocketPal</Text>
      {/* Safe-area-bottom + 20pt, matching the storyboard's tagline
          constraint so the position doesn't jump across the handoff. */}
      <Text
        style={[splashStyles.tagline, textStyle, {bottom: insets.bottom + 20}]}>
        LLM Ventures
      </Text>
    </View>
  );
};

// The gate renders above App's provider tree, so the splash supplies its
// own SafeAreaProvider to read the bottom inset. `initialMetrics` seeds
// the insets synchronously from native window metrics — without it the
// provider renders nothing until the first native inset event, which
// would blank the branded splash for a frame. App's SafeAreaProvider
// takes over once the gate falls through.
const HydrationSplash = () => (
  <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <HydrationSplashContent />
  </SafeAreaProvider>
);

// Wrap the App component with AppWithMigration to show migration UI when
// needed. Gates the first render of any theme-consuming subtree on
// mobx-persist-store hydration so persisted `language` and `colorScheme`
// are observed on first paint.
//
// The gate must wrap App itself (App.tsx:60 calls useTheme() BEFORE
// <PaperProvider> mounts), so AppWithMigrationWrapper — which sits above
// App and has no theme dependency — is the chosen host.
const AppWithMigrationWrapper = observer(() => {
  if (!isHydrated(uiStore)) {
    return <HydrationSplash />;
  }
  return (
    <AppWithMigration>
      <App />
    </AppWithMigration>
  );
});

export default AppWithMigrationWrapper;
