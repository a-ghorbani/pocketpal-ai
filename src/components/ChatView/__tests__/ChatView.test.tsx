import {fireEvent, render} from '@testing-library/react-native';
import * as React from 'react';
import {Text} from 'react-native';

import {
  fileMessage,
  imageMessage,
  textMessage,
  user,
} from '../../../../jest/fixtures';
import {l10n} from '../../../utils/l10n';
import {MessageType} from '../../../utils/types';
import {ChatView} from '../ChatView';
import {SafeAreaProvider} from 'react-native-safe-area-context';

jest.useFakeTimers();

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
      <SafeAreaProvider>
        <ChatView messages={messages} onSendPress={onSendPress} user={user} />
      </SafeAreaProvider>,
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
    );
    const textInput = getByPlaceholderText(l10n.en.inputPlaceholder);
    fireEvent.changeText(textInput, 'text');

    const button = getByLabelText(l10n.en.sendButtonAccessibilityLabel);
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
    );

    const button = getByLabelText(l10n.en.fileButtonAccessibilityLabel);
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
    );

    const button = getByTestId('ContentContainer');
    fireEvent(button, 'onLongPress');
    expect(onMessageLongPress).toHaveBeenCalledWith(imageMessage);
  });

  it('renders empty chat placeholder', () => {
    expect.assertions(1);
    const messages = [];
    const onSendPress = jest.fn();
    const onMessagePress = jest.fn();
    const {getByTestId} = render(
      <ChatView
        messages={messages}
        onMessagePress={onMessagePress}
        onSendPress={onSendPress}
        user={user}
      />,
    );

    const placeholder = getByTestId('empty-state-component');
    expect(placeholder).toBeDefined();
  });

  it('renders custom bottom component', () => {
    expect.assertions(1);
    const customBottomComponent = jest.fn(() => <Text>Bottom</Text>);
    const messages = [];
    const onSendPress = jest.fn();
    const onMessagePress = jest.fn();
    const {getByText} = render(
      <ChatView
        {...{
          customBottomComponent,
          messages,
          onMessagePress,
          onSendPress,
          user,
        }}
      />,
    );

    const customComponent = getByText('Bottom');
    expect(customComponent).toBeDefined();
  });
});
