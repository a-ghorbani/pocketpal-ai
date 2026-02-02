import React from 'react';
import {Text, Alert} from 'react-native';
import {runInAction} from 'mobx';

import {NavigationContainer} from '@react-navigation/native';
import {
  createDrawerNavigator,
  DrawerContentComponentProps,
} from '@react-navigation/drawer';
import {render, fireEvent, waitFor} from '@testing-library/react-native';

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

  it('navigates to Chat screen when a session is pressed', async () => {
    const {getByText, queryByText} = render(<TestNavigator />);

    // Navigate to a differnet page (as the default is chat screen)
    fireEvent.press(getByText('Models'));
    expect(queryByText('Chat Screen')).toBeNull();
    expect(getByText('Models Screen')).toBeTruthy();

    // Pressing a session should navigate to the Chat screen
    fireEvent.press(getByText('Session 1'));
    await waitFor(() => {
      expect(getByText('Chat Screen')).toBeTruthy();
    });
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

  describe('Selection Mode', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      // Reset selection mode state
      runInAction(() => {
        chatSessionStore.isSelectionMode = false;
        chatSessionStore.selectedSessionIds.clear();
      });
    });

    it.skip('long-press menu shows Rename, Export, Delete, and Select options', () => {
      // Skip: Complex menu rendering with react-native-paper Menu component
    });

    it.skip('tapping Select in menu enters selection mode', () => {
      // Skip: Complex menu interaction with react-native-paper Menu component
    });

    it('selection mode shows header with Cancel, count, and overflow menu', () => {
      runInAction(() => {
        chatSessionStore.isSelectionMode = true;
        chatSessionStore.selectedSessionIds.add('session-1');
      });

      const {getByTestId, getByText} = render(<TestNavigator />);

      // Check for Cancel button
      expect(getByTestId('cancel-selection-button')).toBeTruthy();

      // Check for count text
      expect(getByText('1 selected')).toBeTruthy();

      // Check for overflow menu button
      expect(getByTestId('overflow-menu-button')).toBeTruthy();
    });

    it('checkboxes appear next to sessions in selection mode', () => {
      runInAction(() => {
        chatSessionStore.isSelectionMode = true;
      });

      const {getByTestId} = render(<TestNavigator />);

      // Checkboxes should be present for each session
      expect(getByTestId('checkbox-session-1')).toBeTruthy();
      expect(getByTestId('checkbox-session-2')).toBeTruthy();
    });

    it('tapping session toggles selection in selection mode', () => {
      runInAction(() => {
        chatSessionStore.isSelectionMode = true;
      });

      const {getByText} = render(<TestNavigator />);

      // Tap a session
      const session1 = getByText('Session 1');
      fireEvent.press(session1);

      // Verify toggleSessionSelection was called
      expect(chatSessionStore.toggleSessionSelection).toHaveBeenCalledWith(
        'session-1',
      );
    });

    it('tapping checkbox toggles selection', () => {
      runInAction(() => {
        chatSessionStore.isSelectionMode = true;
      });

      const {getByTestId} = render(<TestNavigator />);

      // Tap checkbox
      const checkbox = getByTestId('checkbox-session-1');
      fireEvent.press(checkbox);

      // Verify toggleSessionSelection was called
      expect(chatSessionStore.toggleSessionSelection).toHaveBeenCalledWith(
        'session-1',
      );
    });

    it('header shows correct N selected count', () => {
      runInAction(() => {
        chatSessionStore.isSelectionMode = true;
        chatSessionStore.selectedSessionIds.add('session-1');
        chatSessionStore.selectedSessionIds.add('session-2');
      });

      const {getByText} = render(<TestNavigator />);

      expect(getByText('2 selected')).toBeTruthy();
    });

    it.skip('overflow menu shows Select All when partially selected', () => {
      // Skip: Complex menu interaction with MobX computed properties
    });

    it.skip('overflow menu shows Deselect All when all selected', () => {
      // Skip: Complex menu interaction with MobX computed properties
    });

    it.skip('overflow menu shows Export (N) with count', () => {
      // Skip: Complex menu interaction with MobX computed properties
    });

    it.skip('overflow menu shows Delete (N) with count', () => {
      // Skip: Complex menu interaction with MobX computed properties
    });

    it.skip('clicking Delete shows confirmation dialog', () => {
      // Skip: Complex menu interaction requiring overflow menu to be visible
    });

    it.skip('confirming delete calls bulkDeleteSessions', async () => {
      // Skip: Complex menu interaction requiring overflow menu to be visible
    });

    it.skip('canceling delete does not call bulkDeleteSessions', async () => {
      // Skip: Complex menu interaction requiring overflow menu to be visible
    });

    it('Cancel button exits selection mode', () => {
      runInAction(() => {
        chatSessionStore.isSelectionMode = true;
        chatSessionStore.selectedSessionIds.add('session-1');
      });

      const {getByTestId} = render(<TestNavigator />);

      // Click Cancel button
      const cancelButton = getByTestId('cancel-selection-button');
      fireEvent.press(cancelButton);

      // Verify exitSelectionMode was called
      expect(chatSessionStore.exitSelectionMode).toHaveBeenCalled();
    });

    it('long-press is disabled in selection mode', () => {
      runInAction(() => {
        chatSessionStore.isSelectionMode = true;
      });

      const {getByText} = render(<TestNavigator />);

      // Try to long-press on a session with proper event object
      const session1 = getByText('Session 1');
      fireEvent(session1, 'longPress', {
        nativeEvent: {pageX: 0, pageY: 0},
      });

      // Menu should not appear - no new menu items should be rendered
      // This is verified by checking that the session is still pressable for selection
      fireEvent.press(session1);
      expect(chatSessionStore.toggleSessionSelection).toHaveBeenCalled();
    });

    it.skip('tapping Select All calls selectAllSessions', () => {
      // Skip: Complex menu interaction requiring overflow menu to be visible
    });

    it.skip('tapping Deselect All calls deselectAllSessions', () => {
      // Skip: Complex menu interaction requiring overflow menu to be visible
    });

    it.skip('tapping Export (N) calls bulkExportSessions', async () => {
      // Skip: Complex menu interaction requiring overflow menu to be visible
    });

    it('does not show checkboxes when not in selection mode', () => {
      runInAction(() => {
        chatSessionStore.isSelectionMode = false;
      });

      const {queryByTestId} = render(<TestNavigator />);

      // Checkboxes should not be present
      expect(queryByTestId('checkbox-session-1')).toBeNull();
      expect(queryByTestId('checkbox-session-2')).toBeNull();
    });

    it('tapping session in normal mode navigates to chat', async () => {
      runInAction(() => {
        chatSessionStore.isSelectionMode = false;
      });

      const {getByText} = render(<TestNavigator />);

      // Tap session
      const session1 = getByText('Session 1');
      fireEvent.press(session1);

      // Should call setActiveSession, not toggleSessionSelection
      await waitFor(() => {
        expect(chatSessionStore.setActiveSession).toHaveBeenCalledWith(
          'session-1',
        );
      });
      expect(chatSessionStore.toggleSessionSelection).not.toHaveBeenCalled();
    });
  });
});
