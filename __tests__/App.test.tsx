/**
 * @format
 */

import 'react-native';
import {StyleSheet} from 'react-native';
import React from 'react';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import App from '../App';
jest.useFakeTimers(); // Mock all timers

// Note: import explicitly to use the types shipped with jest.
import {it} from '@jest/globals';

import {act, render} from '@testing-library/react-native';

// Hydration gate test plumbing — see __mocks__/external/mobx-persist-store.js.
// __setHydrated() flips the controllable mock; we restore the default
// (true) after each test so other suites are unaffected.

const {__setHydrated} = require('mobx-persist-store');
const zeroInsets = {top: 0, right: 0, bottom: 0, left: 0};

afterEach(() => {
  __setHydrated(true);
  // Restore the default zero insets (jest/setup.ts) for other suites.
  (useSafeAreaInsets as jest.Mock).mockReturnValue(zeroInsets);
});

it('renders correctly', () => {
  const result = render(<App />);
  expect(result).toBeDefined();
  // With _hydrated === true (default), no splash mounts — closes the
  // regression where the gate could be silently disabled and the splash
  // never renders even though PaperProvider does.
  expect(result.queryByTestId('hydration-splash')).toBeNull();
});

it('renders hydration splash while UIStore is not hydrated', () => {
  __setHydrated(false);
  const result = render(<App />);
  // The splash must mount, AND <PaperProvider> must NOT — i.e. nothing
  // below the gate is in the tree. The drawer header titles, only
  // present after PaperProvider + NavigationContainer mount, are the
  // proxy: they should be absent.
  expect(result.queryByTestId('hydration-splash')).not.toBeNull();
  expect(result.queryByText('Models')).toBeNull();
  expect(result.queryByText('Settings')).toBeNull();
});

it('mounts the app once UIStore hydration completes', () => {
  // Pending hydration: splash mounts, nothing below.
  __setHydrated(false);
  const result = render(<App />);
  expect(result.queryByTestId('hydration-splash')).not.toBeNull();
  expect(result.queryByText('Models')).toBeNull();

  // Hydration completes. The observable flag flips inside MobX action;
  // the observer-wrapped gate re-renders and falls through to the app.
  act(() => {
    __setHydrated(true);
  });

  // Splash gone, post-hydration tree mounted (drawer titles present).
  expect(result.queryByTestId('hydration-splash')).toBeNull();
  expect(result.queryByText('Models')).not.toBeNull();
});

it('positions the splash tagline at safe-area bottom + 20', () => {
  // Simulate a home-indicator device with a non-zero bottom inset.
  (useSafeAreaInsets as jest.Mock).mockReturnValue({
    top: 0,
    right: 0,
    bottom: 34,
    left: 0,
  });
  __setHydrated(false);
  const result = render(<App />);
  const tagline = result.getByText('LLM Ventures');
  const flattened = StyleSheet.flatten(tagline.props.style);
  // bottom = insets.bottom (34) + 20, matching the storyboard constraint.
  expect(flattened.bottom).toBe(54);
});
