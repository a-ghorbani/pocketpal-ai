import {render} from '@testing-library/react-native';
import * as React from 'react';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

import {
  derivedImageMessage,
  derivedTextMessage,
} from '../../../../jest/fixtures';
import {
  fireEvent,
  render as renderWithProviders,
} from '../../../../jest/test-utils';
import {Message} from '../Message';

const rowProps = {
  messageWidth: 440,
  roundBorder: true,
  showAvatar: true,
  showName: false,
  showStatus: true,
};

const TOUCH_HANDLERS = ['onPress', 'onLongPress', 'onPressIn', 'onPressOut'];

const touchHandlersAbove = (node: any) => {
  const found: string[] = [];
  for (let n = node.parent; n; n = n.parent) {
    found.push(
      ...TOUCH_HANDLERS.filter(h => typeof n.props?.[h] === 'function'),
    );
  }
  return found;
};

const longPressHandlers = (root: any) =>
  root.findAll(
    (n: any) => n.props && typeof n.props.onLongPress === 'function',
  );

describe('message', () => {
  it('renders undefined in ContentContainer', () => {
    expect.assertions(2);
    const {getByTestId} = render(
      <Message
        message={{...derivedTextMessage, type: 'custom'}}
        messageWidth={440}
        onMessagePress={jest.fn}
        roundBorder
        showAvatar
        showName
        showStatus
      />,
    );
    const ContentContainer = getByTestId('ContentContainer');
    expect(ContentContainer).toBeDefined();
    expect(ContentContainer.props.children).toBeNull();
  });

  it('renders undefined in ContentContainer with wrong message type', () => {
    expect.assertions(2);
    const {getByTestId} = render(
      <Message
        message={{...derivedTextMessage, type: 'unsupported'}}
        messageWidth={440}
        onMessagePress={jest.fn}
        roundBorder
        showAvatar
        showName
        showStatus
      />,
    );
    const ContentContainer = getByTestId('ContentContainer');
    expect(ContentContainer).toBeDefined();
    expect(ContentContainer.props.children).toBeNull();
  });

  describe('menu and touch handling', () => {
    it('opens the menu from a long-press on a user text row, with a haptic', () => {
      const onMessageMenuPress = jest.fn();
      const {UNSAFE_root, getByTestId, queryByTestId} = renderWithProviders(
        <Message
          {...rowProps}
          message={derivedTextMessage}
          onMessageMenuPress={onMessageMenuPress}
        />,
      );

      const markdown = getByTestId('markdown-content');
      const handlersAbove = touchHandlersAbove(markdown);
      expect(handlersAbove.filter(h => h === 'onLongPress')).toHaveLength(1);
      expect(handlersAbove).not.toContain('onPressIn');
      expect(handlersAbove).not.toContain('onPressOut');
      const [longPressNode] = longPressHandlers(UNSAFE_root);
      expect(longPressHandlers(UNSAFE_root)).toHaveLength(1);
      expect(longPressNode.props.accessible).toBe(false);

      const event = {nativeEvent: {pageX: 1, pageY: 2}};
      fireEvent(markdown, 'longPress', event);
      expect(onMessageMenuPress).toHaveBeenCalledWith(
        expect.objectContaining({id: derivedTextMessage.id, type: 'text'}),
        event,
      );
      expect(ReactNativeHapticFeedback.trigger).toHaveBeenCalledWith(
        'impactLight',
        expect.any(Object),
      );
      expect(queryByTestId('user-row-footer')).toBeNull();
      expect(queryByTestId('message-menu-button')).toBeNull();
      expect(queryByTestId('assistant-turn-footer')).toBeNull();
    });

    it('gives an assistant text row the assistant footer', () => {
      const {getByTestId} = renderWithProviders(
        <Message
          {...rowProps}
          message={{...derivedTextMessage, author: {id: 'assistant'}}}
        />,
      );

      expect(getByTestId('assistant-turn-footer')).toBeTruthy();
    });

    it('wraps an assistant text row in no touch handler', () => {
      const {UNSAFE_root, getByTestId} = renderWithProviders(
        <Message
          {...rowProps}
          message={{...derivedTextMessage, author: {id: 'assistant'}}}
          onMessagePress={jest.fn()}
          onMessageMenuPress={jest.fn()}
        />,
      );

      expect(touchHandlersAbove(getByTestId('markdown-content'))).toEqual([]);
      expect(longPressHandlers(UNSAFE_root)).toHaveLength(0);
    });

    it('keeps the press on an image row, without a long-press or "…"', () => {
      const onMessagePress = jest.fn();
      const {UNSAFE_root, getByTestId, queryByTestId} = renderWithProviders(
        <Message
          {...rowProps}
          message={derivedImageMessage}
          onMessagePress={onMessagePress}
        />,
      );

      expect(touchHandlersAbove(getByTestId('ContentContainer'))).toContain(
        'onPress',
      );
      fireEvent.press(getByTestId('ContentContainer'));
      expect(onMessagePress).toHaveBeenCalledWith(
        expect.objectContaining({id: derivedImageMessage.id, type: 'image'}),
        undefined,
      );
      expect(longPressHandlers(UNSAFE_root)).toHaveLength(0);
      expect(queryByTestId('message-menu-button')).toBeNull();
    });
  });
});
