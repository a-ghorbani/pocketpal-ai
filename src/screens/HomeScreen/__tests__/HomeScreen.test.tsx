import React from 'react';
import {runInAction} from 'mobx';

import {render} from '../../../../jest/test-utils';
import {l10n} from '../../../locales';
import {chatSessionStore} from '../../../store';

import {HomeScreen} from '../HomeScreen';

jest.mock('../../../components/ChatPalModelPickerSheet', () => ({
  ChatPalModelPickerSheet: jest.fn(() => null),
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
});
