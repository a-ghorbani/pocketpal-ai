import React from 'react';
import {Alert} from 'react-native';

import {render, fireEvent} from '../../../../jest/test-utils';

import {HeaderRight} from '../HeaderRight';

import {chatSessionStore, modelStore, uiStore} from '../../../store';
import {defaultCompletionSettings} from '../../../store/ChatSessionStore';
import {L10nContext} from '../../../utils';
import {modelsList} from '../../../../jest/fixtures/models';
import {l10n} from '../../../utils/l10n';

jest.mock('../../UsageStats', () => ({
  UsageStats: jest.fn(() => {
    const {View} = require('react-native');
    return <View testID="usage-stats" />;
  }),
}));

jest.mock(
  '../../ChatGenerationSettingsSheet/ChatGenerationSettingsSheet',
  () => ({
    ChatGenerationSettingsSheet: jest.fn(({isVisible}) => {
      const {View} = require('react-native');
      if (!isVisible) {
        return null;
      }
      return <View testID="chat-generation-settings-sheet" />;
    }),
  }),
);

const renderWithI18n = (ui: React.ReactElement) => {
  return render(
    <L10nContext.Provider value={l10n.en as any}>{ui}</L10nContext.Provider>,
  );
};

describe('HeaderRight', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chatSessionStore.sessions = [];
    chatSessionStore.activeSessionId = null;
  });

  it('renders without UsageStats when displayMemUsage is false', () => {
    uiStore.displayMemUsage = false;
    const {queryByTestId} = renderWithI18n(<HeaderRight />);
    expect(queryByTestId('usage-stats')).toBeNull();
    expect(queryByTestId('reset-button')).toBeTruthy();
    expect(queryByTestId('menu-button')).toBeTruthy();
  });

  it('renders UsageStats when displayMemUsage is true', () => {
    uiStore.displayMemUsage = true;
    const {queryByTestId} = renderWithI18n(<HeaderRight />);
    expect(queryByTestId('usage-stats')).toBeTruthy();
    expect(queryByTestId('reset-button')).toBeTruthy();
    expect(queryByTestId('menu-button')).toBeTruthy();
  });

  it('calls resetActiveSession when reset button is pressed', () => {
    const {queryByTestId} = renderWithI18n(<HeaderRight />);
    const resetButton = queryByTestId('reset-button');
    expect(resetButton).toBeTruthy();
    if (resetButton) {
      fireEvent.press(resetButton);
    }
    expect(chatSessionStore.resetActiveSession).toHaveBeenCalled();
  });

  describe('Menu functionality', () => {
    it('opens menu when menu button is pressed', () => {
      const {getByTestId} = renderWithI18n(<HeaderRight />);
      const menuButton = getByTestId('menu-button');
      fireEvent.press(menuButton);
      // Menu should be visible now
      expect(getByTestId('menu-view')).toBeTruthy();
    });

    describe('with active session', () => {
      beforeEach(() => {
        chatSessionStore.sessions = [
          {
            id: 'test-session',
            title: 'Test Session',
            date: new Date().toISOString(),
            messages: [],
            completionSettings: defaultCompletionSettings,
            settingsSource: 'pal',
          },
        ];
        chatSessionStore.activeSessionId = 'test-session';
        // Set up the mock model store
        modelStore.models = [modelsList[0]];
        modelStore.activeModelId = modelsList[0].id;
        jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
      });

      afterEach(() => {
        jest.restoreAllMocks();
      });

      it('shows session-specific menu items', async () => {
        const {getByTestId, findByText} = renderWithI18n(<HeaderRight />);
        const menuButton = getByTestId('menu-button');
        fireEvent.press(menuButton);

        expect(
          await findByText(l10n.en.components.headerRight.generationSettings),
        ).toBeTruthy();
        expect(
          await findByText(l10n.en.components.headerRight.model),
        ).toBeTruthy();
        expect(
          await findByText(l10n.en.components.headerRight.duplicateChatHistory),
        ).toBeTruthy();
        expect(await findByText(l10n.en.common.rename)).toBeTruthy();
        expect(await findByText(l10n.en.common.delete)).toBeTruthy();
      });

      it('handles generation settings press', async () => {
        const {getByTestId, findByText} = renderWithI18n(<HeaderRight />);
        const menuButton = getByTestId('menu-button');
        fireEvent.press(menuButton);

        const settingsButton = await findByText(
          l10n.en.components.headerRight.generationSettings,
        );
        fireEvent.press(settingsButton);

        expect(getByTestId('chat-generation-settings-sheet')).toBeTruthy();
      });

      it('handles delete action with confirmation', async () => {
        const {getByTestId, findByText} = renderWithI18n(<HeaderRight />);
        const menuButton = getByTestId('menu-button');
        fireEvent.press(menuButton);

        const deleteButton = await findByText('Delete');
        fireEvent.press(deleteButton);

        // Verify Alert was shown with correct options
        expect(Alert.alert).toHaveBeenCalledWith(
          'Delete Chat',
          'Are you sure you want to delete this chat?',
          expect.arrayContaining([
            expect.objectContaining({text: 'Cancel'}),
            expect.objectContaining({
              text: 'Delete',
              style: 'destructive',
              onPress: expect.any(Function),
            }),
          ]),
        );

        // Get the delete callback and call it
        const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
        const deleteCallback = alertCall[2].find(
          (button: any) => button.text === 'Delete',
        ).onPress;
        deleteCallback();

        // Verify the delete actions were called
        expect(chatSessionStore.resetActiveSession).toHaveBeenCalled();
        expect(chatSessionStore.deleteSession).toHaveBeenCalledWith(
          'test-session',
        );
      });

      it('handles duplicate action', async () => {
        const {getByTestId, findByText} = renderWithI18n(<HeaderRight />);
        const menuButton = getByTestId('menu-button');
        fireEvent.press(menuButton);

        const duplicateButton = await findByText('Duplicate chat history');
        fireEvent.press(duplicateButton);

        expect(chatSessionStore.duplicateSession).toHaveBeenCalledWith(
          'test-session',
        );
      });
    });
  });
});
