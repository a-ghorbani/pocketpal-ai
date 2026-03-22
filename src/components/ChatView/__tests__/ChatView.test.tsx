//import {fireEvent, render} from '@testing-library/react-native';
import * as React from 'react';
import {act} from 'react-test-renderer';
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
import {modelStore} from '../../../store';
import * as hooks from '../../../hooks';

jest.useFakeTimers();

// Mock ChatEmptyPlaceholder component
jest.mock('../../ChatEmptyPlaceholder', () => ({
  ChatEmptyPlaceholder: jest.fn(() => null),
}));

jest.mock('../../../hooks', () => {
  const actual = jest.requireActual('../../../hooks');
  return {
    ...actual,
    estimateChatContextUsage: jest.fn(actual.estimateChatContextUsage),
  };
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

describe('chat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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

  it('serializes context usage estimates and applies only the latest result', async () => {
    expect.assertions(5);

    runInAction(() => {
      modelStore.activeModelId = 'test-model-id';
    });

    const firstEstimate = createDeferred<{
      usedTokens: number;
      maxTokens: number;
      usagePercent: number;
      droppedMessageCount: number;
    } | null>();
    const secondEstimate = createDeferred<{
      usedTokens: number;
      maxTokens: number;
      usagePercent: number;
      droppedMessageCount: number;
    } | null>();

    const estimateMock = jest
      .spyOn(hooks, 'estimateChatContextUsage')
      .mockImplementationOnce(() => firstEstimate.promise)
      .mockImplementationOnce(() => secondEstimate.promise);

    const {getByPlaceholderText, findByTestId, queryByText} = render(
      <ChatView
        messages={[]}
        onSendPress={jest.fn()}
        textInputProps={{defaultValue: 'a'}}
        user={user}
      />,
      {withNavigation: true, withBottomSheetProvider: true},
    );

    const textInput = getByPlaceholderText(
      l10n.en.components.chatInput.inputPlaceholder,
    );

    fireEvent.changeText(textInput, 'ab');

    expect(estimateMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstEstimate.resolve({
        usedTokens: 9,
        maxTokens: 100,
        usagePercent: 9,
        droppedMessageCount: 0,
      });
      await firstEstimate.promise;
    });

    expect(estimateMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      secondEstimate.resolve({
        usedTokens: 42,
        maxTokens: 100,
        usagePercent: 42,
        droppedMessageCount: 0,
      });
      await secondEstimate.promise;
    });

    const contextUsage = await findByTestId('context-usage');
    expect(contextUsage).toBeTruthy();
    expect(queryByText('42%')).toBeTruthy();
    expect(queryByText('9%')).toBeNull();
  });
});
