import React from 'react';
import {Text} from 'react-native';
import {runInAction} from 'mobx';

import {NavigationContainer} from '@react-navigation/native';
import {
  createDrawerNavigator,
  DrawerContentComponentProps,
} from '@react-navigation/drawer';
// Uses the repo render helper because paper's Menu renders through a Portal and
// needs PaperProvider at the root.
import {render, fireEvent} from '../../../../jest/test-utils';

import {SidebarContent} from '../SidebarContent';

import {chatSessionStore} from '../../../store';

// The shared `.svg` mock is the string 'SvgMock', so every icon re-exported
// from assets/icons resolves to undefined and rendering the context menu
// throws. Map each icon to a host-component name so the menu can mount.
jest.mock(
  '../../../assets/icons',
  () =>
    new Proxy(
      {__esModule: true},
      {
        get: (target: Record<string, unknown>, prop: string) =>
          prop in target ? target[prop] : String(prop),
      },
    ),
);

const ChatScreen = () => <Text>Chat Screen</Text>;
const Drawer = createDrawerNavigator();

const renderSidebarContent = (props: DrawerContentComponentProps) => (
  <SidebarContent {...props} />
);

const TestNavigator = () => (
  <NavigationContainer>
    <Drawer.Navigator drawerContent={renderSidebarContent}>
      <Drawer.Screen name="Chat" component={ChatScreen} />
    </Drawer.Navigator>
  </NavigationContainer>
);

const openMenuFor = (getByText: (text: string) => any, title: string) => {
  fireEvent(getByText(title), 'longPress', {
    nativeEvent: {pageX: 0, pageY: 0},
  });
};

// groupedSessions is a getter on the real store, so the mock's plain-object
// stand-in needs a mutable view to seed a pinned group.
const mockStore = chatSessionStore as unknown as {
  groupedSessions: Record<string, any[]>;
};

describe('SidebarContent pin/unpin menu item', () => {
  const originalGroups = mockStore.groupedSessions;

  beforeEach(() => {
    runInAction(() => {
      chatSessionStore.isSelectionMode = false;
    });
  });

  afterEach(() => {
    runInAction(() => {
      mockStore.groupedSessions = originalGroups;
    });
  });

  it('offers Pin and toggles the long-pressed session', () => {
    const {getByText, getByTestId} = render(<TestNavigator />);

    openMenuFor(getByText, 'Session 1');

    expect(getByText('Pin')).toBeTruthy();
    fireEvent.press(getByTestId('session-pin-session-1'));

    expect(chatSessionStore.togglePinSession).toHaveBeenCalledWith('session-1');
  });

  it('offers Unpin for a session that is already pinned', () => {
    runInAction(() => {
      mockStore.groupedSessions = {
        Pinned: [{...originalGroups.Today[0], pinned: true}],
      };
    });

    const {getByText} = render(<TestNavigator />);

    expect(getByText('Pinned')).toBeTruthy();
    openMenuFor(getByText, 'Session 1');

    expect(getByText('Unpin')).toBeTruthy();
  });
});
