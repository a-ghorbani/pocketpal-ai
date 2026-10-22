import {render} from '@testing-library/react-native';
import * as React from 'react';
import {Animated, Image, Linking, Platform} from 'react-native';
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
import {l10n} from '../../../locales';
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

    it('keeps a user text row from re-rendering its markdown for a new row object', () => {
      const props = {...rowProps, onMessageMenuPress: jest.fn()};
      const {rerender} = renderWithProviders(
        <Message {...props} message={{...derivedTextMessage}} />,
      );
      const renders = markdownSpy.mock.calls.length;

      rerender(<Message {...props} message={{...derivedTextMessage}} />);

      expect(markdownSpy.mock.calls.length).toBe(renders);
    });

    describe('link long-press', () => {
      const originalOS = Platform.OS;
      afterEach(() => {
        (Platform as any).OS = originalOS;
      });

      const renderLinkRow = (authorId: string, os: string) => {
        (Platform as any).OS = os;
        renderWithProviders(
          <Message
            {...rowProps}
            message={{
              ...derivedTextMessage,
              author: {id: authorId},
              text: '[a](https://x.y)',
            }}
            onMessageMenuPress={jest.fn()}
          />,
        );
        return lastMarkdownProps();
      };

      it('opens the link through the tap handler on a user row on Android', () => {
        const openURL = jest
          .spyOn(Linking, 'openURL')
          .mockResolvedValue(undefined);
        const props = renderLinkRow(derivedTextMessage.author.id, 'android');

        expect(props.onLinkLongPress).toBe(props.onLinkPress);
        props.onLinkLongPress({url: 'https://x.y'});
        expect(openURL).toHaveBeenCalledWith('https://x.y');
        openURL.mockRestore();
      });

      it.each([
        ['a user row on iOS', derivedTextMessage.author.id, 'ios'],
        ['an assistant row on Android', 'assistant', 'android'],
      ])('leaves it to the renderer on %s', (_case, authorId, os) => {
        expect(renderLinkRow(authorId, os).onLinkLongPress).toBeUndefined();
      });
    });

    const userRowOf = (root: any) =>
      root.find(
        (n: any) =>
          typeof n.type === 'string' &&
          typeof n.props.onTouchCancel === 'function',
      );

    it('makes the user bubble one accessible element whose long-press action opens the menu at its centre', () => {
      const onMessageMenuPress = jest.fn();
      const {UNSAFE_root} = renderWithProviders(
        <Message
          {...rowProps}
          message={{...derivedTextMessage, text: 'my question'}}
          onMessageMenuPress={onMessageMenuPress}
        />,
      );
      const native = UNSAFE_root.find(
        (n: any) =>
          typeof n.instance?.measure === 'function' &&
          typeof n.props.onTouchCancel === 'function',
      ).instance;
      native.measure = (cb: (...args: number[]) => void) =>
        cb(0, 0, 100, 40, 10, 20);
      const row = userRowOf(UNSAFE_root);

      expect(row.props.accessible).toBe(true);
      expect(row.props.accessibilityLabel).toBe('my question');
      expect(row.props.accessibilityActions).toEqual([
        {
          name: 'longpress',
          label: l10n.en.components.messageMenuButton.accessibilityLabel,
        },
      ]);

      fireEvent(row, 'accessibilityAction', {
        nativeEvent: {actionName: 'longpress'},
      });

      expect(onMessageMenuPress).toHaveBeenCalledWith(
        expect.objectContaining({id: derivedTextMessage.id, type: 'text'}),
        {nativeEvent: {pageX: 60, pageY: 40}},
      );
    });

    it('labels the user bubble with the rendered text, not the markdown source', () => {
      const {UNSAFE_root} = renderWithProviders(
        <Message
          {...rowProps}
          message={{
            ...derivedTextMessage,
            text: '- first item\n- **second** item\n\nSee [the probe](http://x.y/probe).\n\n```py\nprint(1)\n```',
          }}
        />,
      );

      expect(userRowOf(UNSAFE_root).props.accessibilityLabel).toBe(
        'first item second item See the probe. print(1)',
      );
    });

    it('springs the user bubble to 1.01 on touch start and back on release', () => {
      const spring = jest.spyOn(Animated, 'spring');
      const {UNSAFE_root} = renderWithProviders(
        <Message {...rowProps} message={derivedTextMessage} />,
      );
      const row = userRowOf(UNSAFE_root);

      fireEvent(row, 'touchStart', {nativeEvent: {pageX: 1, pageY: 2}});
      expect(spring).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({toValue: 1.01}),
      );
      fireEvent(row, 'touchEnd', {nativeEvent: {pageX: 1, pageY: 2}});
      expect(spring).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({toValue: 1}),
      );
      spring.mockRestore();
    });

    it('opens no menu from a long-press on an image thumbnail in a user text row', () => {
      jest.useFakeTimers();
      const onMessageMenuPress = jest.fn();
      const {UNSAFE_getAllByType} = renderWithProviders(
        <Message
          {...rowProps}
          message={{...derivedTextMessage, imageUris: ['file:///a.png']}}
          onMessageMenuPress={onMessageMenuPress}
        />,
      );
      const stopPropagation = jest.fn();

      fireEvent(UNSAFE_getAllByType(Image)[0], 'touchStart', {
        nativeEvent: {pageX: 1, pageY: 2},
        stopPropagation,
      });
      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(stopPropagation).toHaveBeenCalled();
      expect(onMessageMenuPress).not.toHaveBeenCalled();
      jest.useRealTimers();
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
