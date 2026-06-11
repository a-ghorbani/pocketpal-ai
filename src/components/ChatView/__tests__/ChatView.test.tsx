//import {fireEvent, render} from '@testing-library/react-native';
import * as React from 'react';
import {runInAction} from 'mobx';

import {
  fileMessage,
  imageMessage,
  textMessage,
  user,
} from '../../../../jest/fixtures';
import {l10n} from '../../../locales';
import {MessageType} from '../../../utils/types';
import {ChatView} from '../ChatView';
import {fireEvent, render} from '../../../../jest/test-utils';
import {ChatEmptyPlaceholder} from '../../ChatEmptyPlaceholder';
import {chatSessionStore, modelStore} from '../../../store';
import {registerDefaultTalents} from '../../../services/talents';
import DeviceInfo from 'react-native-device-info';

// talentRegistry (src/services/talents) is the real singleton in Jest; register
// the built-in engines so render_html (recommendedContextTokens=4096) drives the
// pal-load hint.
registerDefaultTalents();

jest.useFakeTimers();

// Mock ChatEmptyPlaceholder component
jest.mock('../../ChatEmptyPlaceholder', () => ({
  ChatEmptyPlaceholder: jest.fn(() => null),
}));

describe('chat', () => {
  it('renders image preview', async () => {
    const messages = [
      textMessage,
      imageMessage,
      fileMessage,
      {
        ...textMessage,
        createdAt: 1,
        id: 'new-uuidv4',
        status: 'delivered' as const,
      },
    ];
    const onSendPress = jest.fn();
    const {getByTestId, getByText} = render(
      <ChatView messages={messages} onSendPress={onSendPress} user={user} />,
      {withSafeArea: true, withNavigation: true, withBottomSheetProvider: true},
    );

    const button = getByTestId('message-image').parent;
    expect(button).toBeDefined();
    if (button) {
      fireEvent.press(button);
    }
    const closeButton = getByText('✕');
    expect(closeButton).toBeDefined();
  });

  it('sends a text message', () => {
    expect.assertions(1);
    // Set up an active model for the test
    runInAction(() => {
      modelStore.activeModelId = 'test-model-id';
    });

    const messages = [
      textMessage,
      fileMessage,
      {
        ...imageMessage,
        createdAt: 1,
      },
      {
        ...textMessage,
        createdAt: 2,
        id: 'new-uuidv4',
        status: 'sending' as const,
      },
    ];
    const onSendPress = jest.fn();
    const {getByLabelText, getByPlaceholderText} = render(
      <ChatView
        messages={messages}
        onSendPress={onSendPress}
        textInputProps={{defaultValue: 'text'}}
        user={user}
      />,
      {withNavigation: true, withBottomSheetProvider: true},
    );
    const textInput = getByPlaceholderText(
      l10n.en.components.chatInput.inputPlaceholder,
    );
    fireEvent.changeText(textInput, 'text');

    const button = getByLabelText(
      l10n.en.components.sendButton.accessibilityLabel,
    );
    fireEvent.press(button);
    expect(onSendPress).toHaveBeenCalledWith({text: 'text', type: 'text'});
  });

  it('opens file on a file message tap', () => {
    expect.assertions(1);
    const messages = [fileMessage, textMessage, imageMessage];
    const onSendPress = jest.fn();
    const onFilePress = jest.fn();
    const onMessagePress = (message: MessageType.Any) => {
      if (message.type === 'file') {
        onFilePress(message);
      }
    };
    const {getByLabelText} = render(
      <ChatView
        onMessagePress={onMessagePress}
        messages={messages}
        onSendPress={onSendPress}
        showUserAvatars
        user={user}
      />,
      {withNavigation: true, withBottomSheetProvider: true},
    );

    const button = getByLabelText(
      l10n.en.components.fileMessage.fileButtonAccessibilityLabel,
    );
    fireEvent.press(button);
    expect(onFilePress).toHaveBeenCalledWith(fileMessage);
  });

  it('opens image on image message press', () => {
    expect.assertions(1);
    const messages = [imageMessage];
    const onSendPress = jest.fn();
    const onImagePress = jest.fn();
    const onMessagePress = (message: MessageType.Any) => {
      if (message.type === 'image') {
        onImagePress(message);
      }
    };

    const onMessageLongPress = jest.fn();

    const {getByTestId} = render(
      <ChatView
        onMessagePress={onMessagePress}
        onMessageLongPress={onMessageLongPress}
        messages={messages}
        onSendPress={onSendPress}
        showUserAvatars
        user={user}
      />,
      {withNavigation: true, withBottomSheetProvider: true},
    );

    const button = getByTestId('ContentContainer');
    fireEvent.press(button);
    expect(onImagePress).toHaveBeenCalledWith(imageMessage);
  });

  it('fires image on image message long press', () => {
    expect.assertions(1);
    const messages = [imageMessage];
    const onSendPress = jest.fn();
    const onImagePress = jest.fn();
    const onMessagePress = (message: MessageType.Any) => {
      if (message.type === 'image') {
        onImagePress(message);
      }
    };

    const onMessageLongPress = jest.fn();

    const {getByTestId} = render(
      <ChatView
        onMessagePress={onMessagePress}
        onMessageLongPress={onMessageLongPress}
        messages={messages}
        onSendPress={onSendPress}
        showUserAvatars
        user={user}
      />,
      {withNavigation: true, withBottomSheetProvider: true},
    );

    const button = getByTestId('ContentContainer');
    fireEvent(button, 'onLongPress');
    expect(onMessageLongPress).toHaveBeenCalledWith(imageMessage);
  });

  it('renders ChatEmptyPlaceholder when no messages', () => {
    expect.assertions(1);
    const messages = [];
    const onSendPress = jest.fn();
    const onMessagePress = jest.fn();
    render(
      <ChatView
        messages={messages}
        onMessagePress={onMessagePress}
        onSendPress={onSendPress}
        user={user}
      />,
      {withNavigation: true, withBottomSheetProvider: true},
    );

    expect(ChatEmptyPlaceholder).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Active-pal auto-load gate (e2e bench isolation).
  //
  // The mount-time `useEffect` calls `modelStore.selectModel(palDefaultModel)`
  // when `activePal` is set and no model is active. That cold-launch path is
  // benign for end users but catastrophic for the e2e benchmark runner: the
  // matrix's per-cell `devices` / `n_gpu_layers` arrive AFTER the auto-load
  // has already loaded the model with default devices, and `initContext`'s
  // "already loaded → skip" path silently dropped the runner's intent.
  //
  // The fix: gate the auto-load on `modelStore.benchmarkActive` so the
  // benchmark's `enterBenchmarkMode` window is honoured at the React-tree
  // boundary. Two assertions: gate-off triggers the load; gate-on suppresses.
  // ---------------------------------------------------------------------------

  describe('active pal auto-load gate', () => {
    const mockPal = {
      id: 'test-pal',
      name: 'Test',
      type: 'roleplay',
      defaultModel: {id: 'qwen3-1.7b-q4_0'} as any,
    } as any;

    beforeEach(() => {
      (modelStore.selectModel as jest.Mock).mockClear();
      runInAction(() => {
        (modelStore as any).activeModelId = undefined;
        modelStore.benchmarkActive = false;
        modelStore.models = [
          {
            id: 'qwen3-1.7b-q4_0',
            name: 'qwen3',
            isDownloaded: true,
          },
        ] as any;
      });
    });

    it('calls modelStore.selectModel(palDefault) when benchmarkActive=false', () => {
      render(
        <ChatView
          messages={[]}
          onSendPress={jest.fn()}
          user={user}
          activePal={mockPal}
        />,
        {withNavigation: true, withBottomSheetProvider: true},
      );
      expect(modelStore.selectModel).toHaveBeenCalledWith(
        expect.objectContaining({id: 'qwen3-1.7b-q4_0'}),
      );
    });

    it('does NOT call modelStore.selectModel when benchmarkActive=true', () => {
      runInAction(() => {
        modelStore.benchmarkActive = true;
      });
      render(
        <ChatView
          messages={[]}
          onSendPress={jest.fn()}
          user={user}
          activePal={mockPal}
        />,
        {withNavigation: true, withBottomSheetProvider: true},
      );
      expect(modelStore.selectModel).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Pal-load hint "More room" action → opens the IncreaseContextSheet.
  //
  // The hint snackbar is a separate advisory surface from the banner; its
  // action must reach the same sheet even when the banner increase CTA would
  // be hidden, so the sheet is never a dead-end from this entry point. The
  // sheet's content (its testIDs) only mounts once the host opens it.
  // ---------------------------------------------------------------------------
  describe('pal-load hint "More room" action', () => {
    const heavyPal = {
      id: 'heavy-pal',
      name: 'Heavy',
      type: 'roleplay',
      pact: {talents: [{name: 'render_html', required: true}]},
    } as any;

    beforeEach(() => {
      chatSessionStore.palLoadHintSeen = new Set();
      (chatSessionStore.markPalLoadHintSeen as jest.Mock).mockImplementation(
        (sig: string) => chatSessionStore.palLoadHintSeen.add(sig),
      );
      (chatSessionStore.resetActiveSession as jest.Mock).mockClear();
      // The sheet's mount effect awaits getTotalMemory(); the central mock
      // returns a number, so make it Promise-returning for the sheet path.
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(12 * 1e9);
      runInAction(() => {
        modelStore.activeModelId = 'heavy-model';
        modelStore.models = [
          {id: 'heavy-model', name: 'heavy', isDownloaded: true} as any,
        ];
        // Below render_html's 4096 recommendation → hint fires; a value the
        // sheet can also offer larger ladder stops above.
        (modelStore as any).activeContextSettings = {n_ctx: 2048};
        modelStore.contextInitParams = {
          ...modelStore.contextInitParams,
          n_ctx: 2048,
        };
      });
    });

    afterEach(() => {
      runInAction(() => {
        (modelStore as any).activeContextSettings = undefined;
        modelStore.activeModelId = undefined;
        modelStore.models = [];
      });
      (chatSessionStore.markPalLoadHintSeen as jest.Mock).mockReset();
      (DeviceInfo.getTotalMemory as jest.Mock).mockReset();
    });

    it('opens the increase-context sheet when the hint action is tapped, reaching the no-fit state when nothing larger fits', () => {
      // The mocked memory ceiling (4–5 GB) is below the model's requirement at
      // any larger ladder tier, so the sheet resolves to its no-fit state. That
      // is exactly the dead-end risk the hint action must avoid: the sheet stays
      // reachable and offers New chat rather than a permanently disabled confirm.
      const {getByTestId, queryByTestId, getAllByText} = render(
        <ChatView
          messages={[]}
          onSendPress={jest.fn()}
          user={user}
          activePal={heavyPal}
        />,
        {withNavigation: true, withBottomSheetProvider: true},
      );

      // The hint snackbar is shown; the sheet content has not mounted yet.
      expect(getByTestId('pal-load-hint-snackbar')).toBeTruthy();
      expect(queryByTestId('increase-context-no-fit')).toBeNull();
      expect(queryByTestId('increase-context-new-chat')).toBeNull();

      // Tap the snackbar's "More room" action (label === contextMoreRoom).
      const action = getAllByText(l10n.en.chat.contextMoreRoom)[0];
      fireEvent.press(action);

      // The sheet is now open and reachable from the hint. In the no-fit state
      // confirm is hidden and New chat is offered — not a dead-end.
      expect(getByTestId('increase-context-no-fit')).toBeTruthy();
      expect(queryByTestId('increase-context-confirm')).toBeNull();

      const newChat = getByTestId('increase-context-new-chat');
      fireEvent.press(newChat);
      expect(chatSessionStore.resetActiveSession).toHaveBeenCalledTimes(1);
    });
  });
});
