import {render} from '@testing-library/react-native';
import * as React from 'react';
import {EnrichedMarkdownText} from 'react-native-enriched-markdown';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

import {
  derivedImageMessage,
  derivedTextMessage,
} from '../../../../jest/fixtures';
import {
  act,
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

const RESPONDER_HANDLERS = [
  'onStartShouldSetResponder',
  'onMoveShouldSetResponder',
  'onResponderGrant',
];

const responderHandlersAbove = (node: any) => {
  const found: string[] = [];
  for (let n = node.parent; n; n = n.parent) {
    found.push(
      ...RESPONDER_HANDLERS.filter(h => typeof n.props?.[h] === 'function'),
    );
  }
  return found;
};

const markdownSpy = EnrichedMarkdownText as unknown as jest.Mock;
const lastMarkdownProps = () =>
  markdownSpy.mock.calls[markdownSpy.mock.calls.length - 1][0];

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
    it('opens the menu from a touch hold on a user text row, with a haptic, without claiming the JS responder', () => {
      jest.useFakeTimers();
      const onMessageMenuPress = jest.fn();
      const {UNSAFE_root, getByTestId, queryByTestId} = renderWithProviders(
        <Message
          {...rowProps}
          message={derivedTextMessage}
          onMessageMenuPress={onMessageMenuPress}
        />,
      );

      const markdown = getByTestId('markdown-content');
      expect(responderHandlersAbove(markdown)).toEqual([]);
      expect(touchHandlersAbove(markdown)).toEqual([]);
      expect(longPressHandlers(UNSAFE_root)).toHaveLength(0);

      const rows = UNSAFE_root.findAll(
        (n: any) =>
          typeof n.type === 'string' &&
          typeof n.props.onTouchCancel === 'function',
      );
      expect(rows).toHaveLength(1);
      const [row] = rows;
      expect(row.findAll((n: any) => n === markdown)).toHaveLength(1);
      fireEvent(row, 'touchStart', {nativeEvent: {pageX: 1, pageY: 2}});
      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(onMessageMenuPress).toHaveBeenCalledWith(
        expect.objectContaining({id: derivedTextMessage.id, type: 'text'}),
        {nativeEvent: {pageX: 1, pageY: 2}},
      );
      expect(ReactNativeHapticFeedback.trigger).toHaveBeenCalledWith(
        'impactLight',
        expect.any(Object),
      );
      expect(queryByTestId('user-row-footer')).toBeNull();
      expect(queryByTestId('message-menu-button')).toBeNull();
      expect(queryByTestId('assistant-turn-footer')).toBeNull();
      jest.useRealTimers();
    });

    it('opens the menu from a long-press on a link in a user text row', () => {
      const onMessageMenuPress = jest.fn();
      const {getByTestId} = renderWithProviders(
        <Message
          {...rowProps}
          message={{...derivedTextMessage, text: '[a](https://x.y)'}}
          onMessageMenuPress={onMessageMenuPress}
        />,
      );
      const touch = {nativeEvent: {pageX: 3, pageY: 4}};
      (ReactNativeHapticFeedback.trigger as jest.Mock).mockClear();

      fireEvent(getByTestId('markdown-content'), 'touchStart', touch);
      act(() => lastMarkdownProps().onLinkLongPress({url: 'https://x.y'}));

      expect(onMessageMenuPress).toHaveBeenCalledWith(
        expect.objectContaining({id: derivedTextMessage.id, type: 'text'}),
        touch,
      );
      expect(ReactNativeHapticFeedback.trigger).toHaveBeenCalledWith(
        'impactLight',
        expect.any(Object),
      );
    });

    it('keeps a user text row from re-rendering its markdown for a new row object', () => {
      const props = {...rowProps, onMessageMenuPress: jest.fn()};
      const {rerender} = renderWithProviders(
        <Message {...props} message={{...derivedTextMessage}} />,
      );
      const renders = markdownSpy.mock.calls.length;

      rerender(<Message {...props} message={{...derivedTextMessage}} />);

      expect(markdownSpy.mock.calls.length).toBe(renders);
    });

    it('leaves link long-press to the renderer on an assistant text row', () => {
      renderWithProviders(
        <Message
          {...rowProps}
          message={{
            ...derivedTextMessage,
            author: {id: 'assistant'},
            text: '[a](https://x.y)',
          }}
          onMessageMenuPress={jest.fn()}
        />,
      );

      expect(lastMarkdownProps().onLinkLongPress).toBeUndefined();
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
