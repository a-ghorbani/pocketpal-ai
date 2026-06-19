import * as React from 'react';
import {Appearance, StyleSheet, View} from 'react-native';

import {observer} from 'mobx-react';
import {isHydrated} from 'mobx-persist-store';
import {NavigationContainer} from '@react-navigation/native';
import {Provider as PaperProvider} from 'react-native-paper';
import {BottomSheetModalProvider} from '@gorhom/bottom-sheet';
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
  AppWithMigration,
  TTSSetupSheet,
  DownloadOverlay,
  HubRunSheetHost,
} from './src/components';
import {MarkdownProvider} from './src/components/MarkdownView';
import {AutomationBridge, BenchmarkRunnerScreen} from './src/__automation__';
import {RootStack, Stack} from './src/navigation';
import {OnboardingStack} from './src/screens/OnboardingScreens';

// E2E-only deep-link-driven benchmark matrix runner, registered as a
// pushed route on the root Stack. Hidden from any visible nav; reachable
// only by the deep link pocketpal://e2e/benchmark in the e2e flavor build
// (see useDeepLinking cold-launch effect and
// android/app/src/e2e/AndroidManifest.xml). App is the only place allowed
// to import from src/__automation__/, so the route is injected here.
const renderAutomationScreens = () =>
  __E2E__ ? (
    <Stack.Screen
      name={ROUTES.BENCHMARK_RUNNER}
      component={gestureHandlerRootHOC(BenchmarkRunnerScreen)}
      options={{title: 'Benchmark Runner'}}
    />
  ) : null;

// Component that handles deep linking - must be inside NavigationContainer
const DeepLinkHandler = () => {
  useDeepLinking();
  return null;
};

// Branches between the OnboardingStack (first-launch flow) and the main
// app shell (the root Stack hosting the bottom-tab navigator). Both
// children mount under the same provider tree — switching does NOT remount
// providers above this point.
//
// The hydration check is belt-and-suspenders. AppWithMigrationWrapper
// already gates render on `isHydrated(uiStore)`, but reading the same
// observable here keeps the contract local and survives refactors of the
// outer gate.
const SwitchPoint: React.FC = observer(() => {
  if (!isHydrated(uiStore)) {
    return null;
  }
  if (!uiStore.hasCompletedOnboarding) {
    return <OnboardingStack />;
  }
  return <RootStack renderAutomationScreens={renderAutomationScreens} />;
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
                    <SwitchPoint />
                    <TTSSetupSheet />
                    <DownloadOverlay />
                    <HubRunSheetHost />
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

const createStyles = (_theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
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
