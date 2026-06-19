import React from 'react';
import {runInAction} from 'mobx';
import {fireEvent, waitFor} from '@testing-library/react-native';

import {render} from '../../../../jest/test-utils';
import {l10n} from '../../../locales';
import {chatSessionStore, deepLinkStore} from '../../../store';

import {HomeScreen} from '../HomeScreen';

jest.mock('../../../components/ChatPalModelPickerSheet', () => ({
  ChatPalModelPickerSheet: jest.fn(() => null),
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({navigate: mockNavigate}),
}));

const en = l10n.en;

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the serif title and chat-history heading', () => {
    const {getByText, getByTestId} = render(<HomeScreen />, {
      withNavigation: true,
      withSafeArea: true,
    });
    expect(getByTestId('home-screen')).toBeTruthy();
    expect(getByText(en.home.title)).toBeTruthy();
    expect(getByText(en.home.chatHistory)).toBeTruthy();
  });

  it('shows the empty hint when no sessions exist (first-time variant)', () => {
    runInAction(() => {
      chatSessionStore.sessions = [];
    });
    const {getByTestId} = render(<HomeScreen />, {
      withNavigation: true,
      withSafeArea: true,
    });
    expect(getByTestId('home-empty-hint')).toBeTruthy();
  });

  it('renders a history row per session when sessions exist (default variant)', () => {
    runInAction(() => {
      chatSessionStore.sessions = [
        {
          id: 's1',
          title: 'First chat',
          date: '2026-06-01T10:00:00.000Z',
          messages: [],
          completionSettings: {} as any,
          settingsSource: 'custom',
        },
      ];
    });
    const {getByTestId, queryByTestId} = render(<HomeScreen />, {
      withNavigation: true,
      withSafeArea: true,
    });
    expect(getByTestId('home-history-s1')).toBeTruthy();
    expect(queryByTestId('home-empty-hint')).toBeNull();
  });

  it('always renders the Add-pal affordance even with an empty carousel', () => {
    const {getByTestId} = render(<HomeScreen />, {
      withNavigation: true,
      withSafeArea: true,
    });
    expect(getByTestId('home-add-pal')).toBeTruthy();
  });

  it('starts a chat from the composer: prefill + setActivePal + navigate(Chat)', async () => {
    const {getByTestId} = render(<HomeScreen />, {
      withNavigation: true,
      withSafeArea: true,
    });
    fireEvent.changeText(getByTestId('home-composer-input'), 'hi');
    fireEvent.press(getByTestId('home-composer-send'));

    expect(deepLinkStore.setPendingMessage).toHaveBeenCalledWith('hi');
    await waitFor(() =>
      expect(chatSessionStore.setActivePal).toHaveBeenCalled(),
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Chat'));
  });

  it('opens a previous chat from a history row: setActiveSession + navigate(Chat)', async () => {
    runInAction(() => {
      chatSessionStore.sessions = [
        {
          id: 's1',
          title: 'First chat',
          date: '2026-06-01T10:00:00.000Z',
          messages: [],
          completionSettings: {} as any,
          settingsSource: 'custom',
        },
      ];
    });
    const {getByTestId} = render(<HomeScreen />, {
      withNavigation: true,
      withSafeArea: true,
    });
    fireEvent.press(getByTestId('home-history-s1'));

    await waitFor(() =>
      expect(chatSessionStore.setActiveSession).toHaveBeenCalledWith('s1'),
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Chat'));
  });

  it('navigates to Models/Pals editor from the Add-pal affordance', () => {
    const {getByTestId} = render(<HomeScreen />, {
      withNavigation: true,
      withSafeArea: true,
    });
    fireEvent.press(getByTestId('home-add-pal'));
    expect(mockNavigate).toHaveBeenCalledWith('Pals (experimental)');
  });

  it('opens the picker on model-chip tap and does not navigate (scenario F)', () => {
    const {getByTestId} = render(<HomeScreen />, {
      withNavigation: true,
      withSafeArea: true,
    });
    fireEvent.press(getByTestId('home-model-chip'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
