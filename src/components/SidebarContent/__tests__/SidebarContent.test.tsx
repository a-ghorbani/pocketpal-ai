import React from 'react';
import {Text} from 'react-native';

import {NavigationContainer} from '@react-navigation/native';
import {
  createDrawerNavigator,
  DrawerContentComponentProps,
} from '@react-navigation/drawer';
import {render, fireEvent} from '@testing-library/react-native';

import {SidebarContent} from '../SidebarContent';

import {chatSessionStore} from '../../../store';

const ChatScreen = () => <Text>Chat Screen</Text>;
const ModelsScreen = () => <Text>Models Screen</Text>;
const SettingsScreen = () => <Text>Settings Screen</Text>;

const Drawer = createDrawerNavigator();

const renderSidebarContent = (props: DrawerContentComponentProps) => (
  <SidebarContent {...props} />
);

const TestNavigator = () => (
  <NavigationContainer>
    <Drawer.Navigator drawerContent={renderSidebarContent}>
      <Drawer.Screen name="Chat" component={ChatScreen} />
      <Drawer.Screen name="Models" component={ModelsScreen} />
      <Drawer.Screen name="Settings" component={SettingsScreen} />
    </Drawer.Navigator>
  </NavigationContainer>
);

describe('SidebarContent Component', () => {
  it('calls loadSessionList on mount', () => {
    render(<TestNavigator />);

    // loadSessionList is called when the component mounts
    expect(chatSessionStore.loadSessionList).toHaveBeenCalledTimes(1);
  });

  it('renders session groups and items correctly', () => {
    const {getByText} = render(<TestNavigator />);

    expect(getByText('Today')).toBeTruthy();
    expect(getByText('Yesterday')).toBeTruthy();

    expect(getByText('Session 1')).toBeTruthy();
    expect(getByText('Session 2')).toBeTruthy();
  });

  it('navigates to Chat screen when a session is pressed', () => {
    const {getByText, queryByText} = render(<TestNavigator />);

    // Navigate to a differnet page (as the default is chat screen)
    fireEvent.press(getByText('Models'));
    expect(queryByText('Chat Screen')).toBeNull();
    expect(getByText('Models Screen')).toBeTruthy();

    // Pressing a session should navigate to the Chat screen
    fireEvent.press(getByText('Session 1'));
    expect(getByText('Chat Screen')).toBeTruthy();
  });

  it('navigates to correct screen from drawer items', () => {
    const {getByText, queryByText} = render(<TestNavigator />);

    // Ensure the Models screen is rendered by pressing the 'Models' drawer item
    fireEvent.press(getByText('Models'));
    expect(getByText('Models Screen')).toBeTruthy();
    expect(queryByText('Chat Screen')).toBeNull();

    // Ensure the Settings screen is rendered by pressing the 'Settings' drawer item
    fireEvent.press(getByText('Settings'));
    expect(getByText('Settings Screen')).toBeTruthy();
    expect(queryByText('Models Screen')).toBeNull();
  });
});
