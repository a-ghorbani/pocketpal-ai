import React from 'react';
import {createNavigationContainerRef} from '@react-navigation/native';

import {render} from '../../../jest/test-utils';
import {ROUTES} from '../../utils/navigationConstants';

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
    DevToolsScreen: stub('DevToolsScreen'),
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
        ROUTES.BENCHMARK,
        ROUTES.APP_INFO,
        ROUTES.DEV_TOOLS,
      ]),
    );
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
