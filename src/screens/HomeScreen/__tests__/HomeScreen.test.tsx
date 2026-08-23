import React from 'react';
import {Alert} from 'react-native';
import {runInAction} from 'mobx';
import {fireEvent, waitFor} from '@testing-library/react-native';

import {render} from '../../../../jest/test-utils';
import {l10n} from '../../../locales';
import {
  chatSessionStore,
  deepLinkStore,
  palStore,
  modelStore,
} from '../../../store';
import {mockLocalPal} from '../../../../jest/fixtures/pals';

import {HomeScreen} from '../HomeScreen';

const mockExportChatSession = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../utils/exportUtils', () => ({
  ...jest.requireActual('../../../utils/exportUtils'),
  exportChatSession: (id: string) => mockExportChatSession(id),
}));

const mockPicker = jest.fn((_props: any) => null);
jest.mock('../../../components/ChatPalModelPickerSheet', () => ({
  ChatPalModelPickerSheet: (props: any) => mockPicker(props),
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: mockNavigate,
    addListener: jest.fn(() => jest.fn()),
  }),
}));

const en = l10n.en;

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runInAction(() => {
      palStore.pals = [];
      modelStore.models = [];
      modelStore.activeModelId = undefined;
      chatSessionStore.sessions = [];
    });
  });

  it('renders the serif title; hides the chat-history header when empty', () => {
    const {queryByText, queryByTestId, getByTestId} = render(<HomeScreen />, {
      withNavigation: true,
      withSafeArea: true,
    });
    expect(getByTestId('home-screen')).toBeTruthy();
    // Title renders across two lines; assert via its testID + a11y label.
    expect(getByTestId('home-title')).toBeTruthy();
    // First-time / empty state shows only the centered bubble + hint — no
    // "Chat history" header and no search affordance (Figma 888:33856).
    expect(queryByText(en.home.chatHistory)).toBeNull();
    expect(queryByTestId('home-history-search')).toBeNull();
  });

  it('shows the centered empty state (icon + hint) when no sessions exist', () => {
    runInAction(() => {
      chatSessionStore.sessions = [];
    });
    const {getByTestId} = render(<HomeScreen />, {
      withNavigation: true,
      withSafeArea: true,
    });
    expect(getByTestId('home-empty-state')).toBeTruthy();
    expect(getByTestId('home-empty-icon')).toBeTruthy();
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
    const {getByText, getByTestId, queryByTestId} = render(<HomeScreen />, {
      withNavigation: true,
      withSafeArea: true,
    });
    expect(getByTestId('home-history-s1')).toBeTruthy();
    // The "Chat history" header + search appear only in the populated state.
    expect(getByText(en.home.chatHistory)).toBeTruthy();
    expect(getByTestId('home-history-search')).toBeTruthy();
    expect(queryByTestId('home-empty-hint')).toBeNull();
    expect(queryByTestId('home-empty-state')).toBeNull();
  });

  it('always renders the Add-pal affordance even with an empty carousel', () => {
    const {getByTestId} = render(<HomeScreen />, {
      withNavigation: true,
      withSafeArea: true,
    });
    expect(getByTestId('home-add-pal')).toBeTruthy();
  });

  it('launches Chat from the composer card: setActivePal + navigate(Chat), no message', async () => {
    const {getByTestId} = render(<HomeScreen />, {
      withNavigation: true,
      withSafeArea: true,
    });
    fireEvent.press(getByTestId('home-composer-input'));

    // The launcher carries no prefill text.
    expect(deepLinkStore.setPendingMessage).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(chatSessionStore.setActivePal).toHaveBeenCalled(),
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Chat'));
  });

  it('launches Chat from the send affordance the same as the card', async () => {
    const {getByTestId} = render(<HomeScreen />, {
      withNavigation: true,
      withSafeArea: true,
    });
    fireEvent.press(getByTestId('home-composer-send'));

    expect(deepLinkStore.setPendingMessage).not.toHaveBeenCalled();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Chat'));
  });

  it('requests one-shot auto-focus only when a model is loaded', async () => {
    runInAction(() => {
      modelStore.engine = {} as any;
    });
    const {getByTestId} = render(<HomeScreen />, {
      withNavigation: true,
      withSafeArea: true,
    });
    fireEvent.press(getByTestId('home-composer-input'));
    // The flag is set after the setActivePal await, right before navigating.
    await waitFor(() =>
      expect(deepLinkStore.setAutoFocusChat).toHaveBeenCalledWith(true),
    );
    runInAction(() => {
      modelStore.engine = undefined;
    });
  });

  it('does NOT request auto-focus when no model is loaded', () => {
    runInAction(() => {
      modelStore.engine = undefined;
    });
    const {getByTestId} = render(<HomeScreen />, {
      withNavigation: true,
      withSafeArea: true,
    });
    fireEvent.press(getByTestId('home-composer-input'));
    expect(deepLinkStore.setAutoFocusChat).not.toHaveBeenCalled();
  });

  it('does NOT request auto-focus when opening a chat from a history row', async () => {
    runInAction(() => {
      modelStore.engine = {} as any;
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
    expect(deepLinkStore.setAutoFocusChat).not.toHaveBeenCalled();
    runInAction(() => {
      modelStore.engine = undefined;
    });
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

  it('renders a carousel item per pal', () => {
    runInAction(() => {
      palStore.pals = [mockLocalPal];
    });
    const {getByTestId} = render(<HomeScreen />, {
      withNavigation: true,
      withSafeArea: true,
    });
    expect(getByTestId(`home-pal-${mockLocalPal.id}`)).toBeTruthy();
  });

  it('shows the active model name in the model chip when a model is active', () => {
    runInAction(() => {
      modelStore.models = [{id: 'm1', name: 'Qwen3 1.7B'} as any];
      modelStore.activeModelId = 'm1';
    });
    const {getByText} = render(<HomeScreen />, {
      withNavigation: true,
      withSafeArea: true,
    });
    expect(getByText(`${en.home.modelChipPrefix} Qwen3 1.7B`)).toBeTruthy();
  });

  it('shows the empty model-chip label when no model is active', () => {
    const {getByText} = render(<HomeScreen />, {
      withNavigation: true,
      withSafeArea: true,
    });
    expect(getByText(en.home.modelChipEmpty)).toBeTruthy();
  });

  it('renders the picker only after the model chip is tapped', () => {
    const {getByTestId} = render(<HomeScreen />, {
      withNavigation: true,
      withSafeArea: true,
    });
    expect(mockPicker).not.toHaveBeenCalled();
    fireEvent.press(getByTestId('home-model-chip'));
    expect(mockPicker).toHaveBeenCalled();
    expect(mockPicker.mock.calls[0][0].isVisible).toBe(true);
  });

  it('selecting a pal in the picker sets the active pal without navigating (scenario F)', () => {
    runInAction(() => {
      palStore.pals = [mockLocalPal];
    });
    const {getByTestId} = render(<HomeScreen />, {
      withNavigation: true,
      withSafeArea: true,
    });
    fireEvent.press(getByTestId('home-model-chip'));
    const pickerProps = mockPicker.mock.calls[0][0] as any;

    pickerProps.onPalSelect(mockLocalPal.id);

    expect(palStore.getPalById).toHaveBeenCalledWith(mockLocalPal.id);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('groups the composer card and model chip inside the composer cluster', () => {
    const {getByTestId} = render(<HomeScreen />, {
      withNavigation: true,
      withSafeArea: true,
    });
    const dock = getByTestId('home-composer-dock');
    expect(dock.findByProps({testID: 'home-composer-input'})).toBeTruthy();
    expect(dock.findByProps({testID: 'home-model-chip'})).toBeTruthy();
  });

  it('renders the composer placeholder as static text (no editable input)', () => {
    const {getByText} = render(<HomeScreen />, {
      withNavigation: true,
      withSafeArea: true,
    });
    expect(getByText(en.home.composerPlaceholderGeneric)).toBeTruthy();
  });

  const palNamed = (id: string, name: string): any => ({
    ...mockLocalPal,
    id,
    name,
    source: 'local',
  });
  const placeholderFor = (name: string) =>
    en.home.composerPlaceholder.replace('{{pal}}', name);

  it('defaults selection to the onboarding pal (Pip), not the first pal', () => {
    runInAction(() => {
      // Lookie (the video pal) is seeded first; Pip is the onboarding pal.
      palStore.pals = [palNamed('lookie', 'Lookie'), palNamed('pip', 'Pip')];
      chatSessionStore.sessions = [];
    });
    const {getByText} = render(<HomeScreen />, {
      withNavigation: true,
      withSafeArea: true,
    });
    expect(getByText(placeholderFor('Pip'))).toBeTruthy();
  });

  it('defaults selection to the last-used pal over the onboarding pal', () => {
    runInAction(() => {
      palStore.pals = [
        palNamed('lookie', 'Lookie'),
        palNamed('pip', 'Pip'),
        palNamed('sage', 'Sage'),
      ];
      chatSessionStore.sessions = [
        {
          id: 's1',
          title: 'Older',
          date: '2026-06-01T10:00:00.000Z',
          activePalId: 'pip',
          messages: [],
          completionSettings: {} as any,
          settingsSource: 'custom',
        },
        {
          id: 's2',
          title: 'Newer',
          date: '2026-06-10T10:00:00.000Z',
          activePalId: 'sage',
          messages: [],
          completionSettings: {} as any,
          settingsSource: 'custom',
        },
      ];
    });
    const {getByText} = render(<HomeScreen />, {
      withNavigation: true,
      withSafeArea: true,
    });
    expect(getByText(placeholderFor('Sage'))).toBeTruthy();
  });

  it('orders the carousel by usage recency, most-recent first', () => {
    runInAction(() => {
      palStore.pals = [
        palNamed('lookie', 'Lookie'),
        palNamed('pip', 'Pip'),
        palNamed('sage', 'Sage'),
      ];
      chatSessionStore.sessions = [
        {
          id: 's1',
          title: 'a',
          date: '2026-06-10T10:00:00.000Z',
          activePalId: 'sage',
          messages: [],
          completionSettings: {} as any,
          settingsSource: 'custom',
        },
      ];
    });
    const {getAllByTestId} = render(<HomeScreen />, {
      withNavigation: true,
      withSafeArea: true,
    });
    const order = getAllByTestId(/^home-pal-/).map(n => n.props.testID);
    // Sage (most recently used) leads; the rest keep their seeded order.
    expect(order).toEqual(['home-pal-sage', 'home-pal-lookie', 'home-pal-pip']);
  });

  it('fronts the default pal (Pip) in the carousel on a cold install', () => {
    runInAction(() => {
      // Lookie is seeded first, but with no usage the default (Pip) must lead.
      palStore.pals = [palNamed('lookie', 'Lookie'), palNamed('pip', 'Pip')];
      chatSessionStore.sessions = [];
    });
    const {getAllByTestId} = render(<HomeScreen />, {
      withNavigation: true,
      withSafeArea: true,
    });
    const order = getAllByTestId(/^home-pal-/).map(n => n.props.testID);
    expect(order).toEqual(['home-pal-pip', 'home-pal-lookie']);
  });

  it('renders history rows newest-first regardless of store order', () => {
    runInAction(() => {
      chatSessionStore.sessions = [
        {
          id: 'old',
          title: 'Older chat',
          date: '2026-06-01T10:00:00.000Z',
          messages: [],
          completionSettings: {} as any,
          settingsSource: 'custom',
        },
        {
          id: 'new',
          title: 'Newer chat',
          date: '2026-06-10T10:00:00.000Z',
          messages: [],
          completionSettings: {} as any,
          settingsSource: 'custom',
        },
      ];
    });
    const {getAllByTestId} = render(<HomeScreen />, {
      withNavigation: true,
      withSafeArea: true,
    });
    const order = getAllByTestId(/^home-history-/)
      .map(n => n.props.testID)
      .filter(id => id !== 'home-history-search');
    expect(order).toEqual(['home-history-new', 'home-history-old']);
  });

  it('deselects the active pal when it is tapped (generic placeholder)', () => {
    runInAction(() => {
      palStore.pals = [palNamed('lookie', 'Lookie'), palNamed('pip', 'Pip')];
      chatSessionStore.sessions = [];
    });
    const {getByText, getByTestId} = render(<HomeScreen />, {
      withNavigation: true,
      withSafeArea: true,
    });
    // Pip is the default active pal; tapping it clears the selection.
    expect(getByText(placeholderFor('Pip'))).toBeTruthy();
    fireEvent.press(getByTestId('home-pal-pip'));
    expect(getByText(en.home.composerPlaceholderGeneric)).toBeTruthy();
  });

  describe('chat-row overflow menu', () => {
    // The drawer carried per-row pin/rename/export/delete; the bottom-tab swap
    // dropped it, leaving pinning with no call site anywhere in the app.
    const twoSessions = () =>
      runInAction(() => {
        chatSessionStore.sessions = [
          {
            id: 'a',
            title: 'First chat',
            date: '2026-06-01T10:00:00.000Z',
            messages: [],
            completionSettings: {} as any,
            settingsSource: 'custom',
          },
          {
            id: 'b',
            title: 'Second chat',
            date: '2026-06-02T10:00:00.000Z',
            messages: [],
            completionSettings: {} as any,
            settingsSource: 'custom',
          },
        ] as any;
      });

    const openMenu = (getByTestId: any, id: string) => {
      fireEvent.press(getByTestId(`home-session-more-${id}`));
    };

    it('the kebab is an actual control, not decoration', () => {
      twoSessions();
      const {getByTestId} = render(<HomeScreen />, {
        withNavigation: true,
        withSafeArea: true,
      });
      const kebab = getByTestId('home-session-more-a');
      expect(kebab.props.accessibilityRole).toBe('button');
      expect(kebab.props.accessibilityLabel).toBe(en.home.sessionActions);
      // The negative control for this whole slice: before the fix the kebab was
      // a bare View, so opening a menu from it was impossible.
      expect(kebab.props.onClick ?? kebab.props.onPress).toBeDefined();
    });

    it('opens the menu for the tapped row only', () => {
      twoSessions();
      const {getByTestId, queryByTestId} = render(<HomeScreen />, {
        withNavigation: true,
        withSafeArea: true,
      });
      expect(queryByTestId('home-session-pin-a')).toBeNull();

      openMenu(getByTestId, 'a');

      expect(getByTestId('home-session-pin-a')).toBeTruthy();
      expect(queryByTestId('home-session-pin-b')).toBeNull();
    });

    it('pin routes to togglePinSession — the writer the nav swap orphaned', () => {
      twoSessions();
      const {getByTestId} = render(<HomeScreen />, {
        withNavigation: true,
        withSafeArea: true,
      });
      openMenu(getByTestId, 'a');
      fireEvent.press(getByTestId('home-session-pin-a'));

      expect(chatSessionStore.togglePinSession).toHaveBeenCalledWith('a');
    });

    it('export routes to exportChatSession', async () => {
      twoSessions();
      const {getByTestId} = render(<HomeScreen />, {
        withNavigation: true,
        withSafeArea: true,
      });
      openMenu(getByTestId, 'b');
      fireEvent.press(getByTestId('home-session-export-b'));

      await waitFor(() => {
        expect(mockExportChatSession).toHaveBeenCalledWith('b');
      });
    });

    it('delete asks first and only deletes on confirm', () => {
      twoSessions();
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const {getByTestId} = render(<HomeScreen />, {
        withNavigation: true,
        withSafeArea: true,
      });
      openMenu(getByTestId, 'a');
      fireEvent.press(getByTestId('home-session-delete-a'));

      expect(chatSessionStore.deleteSession).not.toHaveBeenCalled();
      expect(alert).toHaveBeenCalled();

      const confirm = (alert.mock.calls[0][2] as any[]).find(
        b => b.style === 'destructive',
      );
      confirm.onPress();

      expect(chatSessionStore.deleteSession).toHaveBeenCalledWith('a');
      alert.mockRestore();
    });

    it('labels the item Unpin and marks the row when the session is pinned', () => {
      runInAction(() => {
        chatSessionStore.sessions = [
          {
            id: 'p',
            title: 'Pinned chat',
            date: '2026-06-01T10:00:00.000Z',
            pinned: true,
            messages: [],
            completionSettings: {} as any,
            settingsSource: 'custom',
          },
        ] as any;
      });
      const {getByTestId, getByText} = render(<HomeScreen />, {
        withNavigation: true,
        withSafeArea: true,
      });
      expect(getByTestId('home-session-pinned-p')).toBeTruthy();

      openMenu(getByTestId, 'p');
      expect(getByText(en.components.sidebarContent.unpin)).toBeTruthy();
    });

    it('sorts pinned sessions above newer unpinned ones', () => {
      runInAction(() => {
        chatSessionStore.sessions = [
          {
            id: 'newer',
            title: 'Newer unpinned',
            date: '2026-06-10T10:00:00.000Z',
            messages: [],
            completionSettings: {} as any,
            settingsSource: 'custom',
          },
          {
            id: 'older',
            title: 'Older pinned',
            date: '2026-06-01T10:00:00.000Z',
            pinned: true,
            messages: [],
            completionSettings: {} as any,
            settingsSource: 'custom',
          },
        ] as any;
      });
      const {getAllByTestId} = render(<HomeScreen />, {
        withNavigation: true,
        withSafeArea: true,
      });
      const order = getAllByTestId(/^home-history-/)
        .map(n => n.props.testID)
        .filter(id => id !== 'home-history-search');
      expect(order).toEqual(['home-history-older', 'home-history-newer']);
    });
  });
});
