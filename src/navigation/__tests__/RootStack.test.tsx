import React from 'react';
import {createNavigationContainerRef} from '@react-navigation/native';

import {render} from '../../../jest/test-utils';
import {ROUTES} from '../../utils/navigationConstants';
import {l10n} from '../../locales';

import {RootStack} from '../RootStack';

jest.useFakeTimers();

// Stub the heavy pushed-route screens so this test exercises the Stack's
// route topology, not each screen's internals.
jest.mock('../../screens', () => {
  const {Text} = require('react-native');
  const stub = (label: string) => () => <Text>{label}</Text>;
  return {
    ChatScreen: stub('ChatScreen'),
    ModelsScreen: stub('ModelsScreen'),
    BenchmarkScreen: stub('BenchmarkScreen'),
    AboutScreen: stub('AboutScreen'),
    PreferencesScreen: stub('PreferencesScreen'),
    AppSettingsScreen: stub('AppSettingsScreen'),
    DevToolsScreen: stub('DevToolsScreen'),
    AccountLoginScreen: stub('AccountLoginScreen'),
    AccountSignUpScreen: stub('AccountSignUpScreen'),
    AccountScreen: stub('AccountScreen'),
  };
});

jest.mock('../../screens/PalsScreen', () => {
  const {Text} = require('react-native');
  return () => <Text>PalsScreen</Text>;
});

jest.mock('../MainTabs', () => {
  const {Text} = require('react-native');
  return {MainTabs: () => <Text>MainTabs</Text>};
});

jest.mock('../../components', () => ({
  ModelsHeaderRight: () => null,
  PalHeaderRight: () => null,
}));

const renderWithRef = () => {
  const navigationRef = createNavigationContainerRef();
  const {NavigationContainer} = jest.requireActual('@react-navigation/native');
  const utils = render(
    <NavigationContainer ref={navigationRef}>
      <RootStack />
    </NavigationContainer>,
    {withSafeArea: true},
  );
  return {navigationRef, ...utils};
};

const currentTitle = (navigationRef: {
  getCurrentOptions: () => object | undefined;
}) =>
  (navigationRef.getCurrentOptions() as {title?: string} | undefined)?.title;

// Starts the container already on the route instead of navigating to it: a
// real transition unmounts the tab host, and the RN Animated teardown throws
// under react-test-renderer.
const renderAtRoute = (routeName: string) => {
  const navigationRef = createNavigationContainerRef();
  const {NavigationContainer} = jest.requireActual('@react-navigation/native');
  const utils = render(
    <NavigationContainer
      ref={navigationRef}
      initialState={{routes: [{name: routeName}]}}>
      <RootStack />
    </NavigationContainer>,
    {withSafeArea: true},
  );
  return {navigationRef, ...utils};
};

describe('RootStack', () => {
  it('mounts MainTabs as the initial route', () => {
    const {getByText} = renderWithRef();
    expect(getByText('MainTabs')).toBeTruthy();
  });

  it('registers MainTabs plus every prior destination as a flat route (I2, I5)', () => {
    const {navigationRef} = renderWithRef();
    const routeNames = navigationRef.getRootState().routeNames;

    // No screen reachable before the migration is orphaned (I2): the tabs
    // host plus each non-tab destination is a sibling route on the stack.
    expect(routeNames).toEqual(
      expect.arrayContaining([
        'MainTabs',
        ROUTES.CHAT,
        ROUTES.MODELS,
        ROUTES.PALS,
        ROUTES.PREFERENCES,
        ROUTES.APP_SETTINGS,
        ROUTES.BENCHMARK,
        ROUTES.APP_INFO,
        ROUTES.DEV_TOOLS,
      ]),
    );
  });

  it('registers the three account routes as pushed siblings', () => {
    const {navigationRef} = renderWithRef();
    const routeNames = navigationRef.getRootState().routeNames;

    expect(routeNames).toEqual(
      expect.arrayContaining([
        ROUTES.ACCOUNT_LOGIN,
        ROUTES.ACCOUNT_SIGN_UP,
        ROUTES.ACCOUNT,
      ]),
    );
  });

  it.each([[ROUTES.ACCOUNT_LOGIN], [ROUTES.ACCOUNT_SIGN_UP]])(
    'pins %s to an empty title so the header never paints the route name',
    routeName => {
      const {navigationRef} = renderAtRoute(routeName);

      expect(currentTitle(navigationRef)).toBe('');
    },
  );

  it('titles Account Settings from the localized screen title', () => {
    const {navigationRef} = renderAtRoute(ROUTES.ACCOUNT);

    expect(currentTitle(navigationRef)).toBe(
      l10n.en.screenTitles.accountSettings,
    );
  });

  it('registers the Settings sub-screens as pushed routes', () => {
    const {navigationRef} = renderWithRef();
    const routeNames = navigationRef.getRootState().routeNames;

    expect(routeNames).toContain(ROUTES.PREFERENCES);
    expect(routeNames).toContain(ROUTES.APP_SETTINGS);
  });

  it('keeps the deep-link target route names unchanged (I5)', () => {
    const {navigationRef} = renderWithRef();
    const routeNames = navigationRef.getRootState().routeNames;

    // Deep links resolve via flat navigate(ROUTES.*) calls; the chat target
    // must still be addressable by its existing string.
    expect(routeNames).toContain('Chat');
    expect(ROUTES.CHAT).toBe('Chat');
  });

  it('omits the automation runner when no automation screens are injected (9h)', () => {
    const {navigationRef} = renderWithRef();
    const routeNames = navigationRef.getRootState().routeNames;
    expect(routeNames).not.toContain(ROUTES.BENCHMARK_RUNNER);
  });

  it('mounts an injected automation route as a sibling pushed route (E2E deep-link target, I5/G)', () => {
    const navigationRef = createNavigationContainerRef();
    const {NavigationContainer} = jest.requireActual(
      '@react-navigation/native',
    );
    const {Text} = require('react-native');
    const {Stack} = require('../RootStack');
    render(
      <NavigationContainer ref={navigationRef}>
        <RootStack
          renderAutomationScreens={() => (
            <Stack.Screen
              name={ROUTES.BENCHMARK_RUNNER}
              component={() => <Text>BenchmarkRunner</Text>}
            />
          )}
        />
      </NavigationContainer>,
      {withSafeArea: true},
    );
    const routeNames = navigationRef.getRootState().routeNames;
    expect(routeNames).toContain(ROUTES.BENCHMARK_RUNNER);
  });
});
