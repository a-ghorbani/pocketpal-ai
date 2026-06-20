import React from 'react';
import {fireEvent} from '@testing-library/react-native';
import {useKeyboardState} from 'react-native-keyboard-controller';

import {render} from '../../../jest/test-utils';

import {MainTabs} from '../MainTabs';

const mockUseKeyboardState = useKeyboardState as jest.Mock;

jest.mock('../../screens', () => {
  const {Text} = require('react-native');
  return {
    HomeScreen: () => <Text>HomeScreen</Text>,
    ExploreScreen: () => <Text>ExploreScreen</Text>,
    SettingsScreen: () => <Text>SettingsScreen</Text>,
  };
});

describe('MainTabs', () => {
  beforeEach(() => {
    mockUseKeyboardState.mockImplementation((selector?: (s: any) => any) =>
      selector ? selector({isVisible: false}) : {isVisible: false},
    );
  });

  it('renders the floating tab bar with the three tab items', () => {
    const {getByTestId} = render(<MainTabs />, {
      withNavigation: true,
      withSafeArea: true,
    });
    expect(getByTestId('ui-bottom-nav')).toBeTruthy();
    expect(getByTestId('ui-bottom-nav-item-ChatsTab')).toBeTruthy();
    expect(getByTestId('ui-bottom-nav-item-ExploreTab')).toBeTruthy();
    expect(getByTestId('ui-bottom-nav-item-SettingsTab')).toBeTruthy();
  });

  it('starts on the Chats tab with the Home screen mounted', () => {
    const {getByText, getByTestId} = render(<MainTabs />, {
      withNavigation: true,
      withSafeArea: true,
    });
    expect(getByText('HomeScreen')).toBeTruthy();
    expect(
      getByTestId('ui-bottom-nav-item-ChatsTab').props.accessibilityState
        ?.selected,
    ).toBe(true);
  });

  it('switches to the Settings tab on tab press', () => {
    const {getByText, getByTestId} = render(<MainTabs />, {
      withNavigation: true,
      withSafeArea: true,
    });
    fireEvent.press(getByTestId('ui-bottom-nav-item-SettingsTab'));
    expect(getByText('SettingsScreen')).toBeTruthy();
  });

  it('leaves the tab bar hit-testable when the keyboard is closed', () => {
    const {getByTestId} = render(<MainTabs />, {
      withNavigation: true,
      withSafeArea: true,
    });
    expect(getByTestId('floating-tab-bar').props.pointerEvents).toBe('auto');
  });

  it('removes the tab bar from the hit-test region while the keyboard is open', () => {
    mockUseKeyboardState.mockImplementation((selector?: (s: any) => any) =>
      selector ? selector({isVisible: true}) : {isVisible: true},
    );
    const {getByTestId} = render(<MainTabs />, {
      withNavigation: true,
      withSafeArea: true,
    });
    expect(getByTestId('floating-tab-bar').props.pointerEvents).toBe('none');
  });
});
