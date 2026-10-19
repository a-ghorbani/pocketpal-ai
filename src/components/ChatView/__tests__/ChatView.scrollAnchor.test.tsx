import * as React from 'react';
import * as Reanimated from 'react-native-reanimated';

import {textMessage, user} from '../../../../jest/fixtures';
import {act, render} from '../../../../jest/test-utils';
import {ChatView} from '../ChatView';

jest.mock('react-native-worklets', () => ({
  ...jest.requireActual('react-native-worklets'),
  scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) =>
    fn(...args),
}));

jest.mock('../../ChatEmptyPlaceholder', () => ({
  ChatEmptyPlaceholder: jest.fn(() => null),
}));

type Reaction = (away: boolean, wasAway: boolean | null) => void;

const messages = [
  textMessage,
  {
    ...textMessage,
    createdAt: 1,
    id: 'assistant-turn',
    author: {id: 'assistant-id'},
    text: 'newest assistant output',
    status: 'delivered' as const,
  },
];

const chatList = (root: any) =>
  root.find(
    (n: any) =>
      n.props &&
      n.props.keyboardDismissMode !== undefined &&
      Array.isArray(n.props.data),
  );

describe('ChatView scroll anchoring', () => {
  let reactions: Reaction[];
  let reactionSpy: jest.SpyInstance;

  beforeEach(() => {
    reactions = [];
    reactionSpy = jest
      .spyOn(Reanimated, 'useAnimatedReaction')
      .mockImplementation((_prepare, react) => {
        reactions.push(react as unknown as Reaction);
      });
  });

  afterEach(() => {
    reactionSpy.mockRestore();
  });

  const renderChat = (isStreaming: boolean) =>
    render(
      <ChatView
        messages={messages}
        onSendPress={jest.fn()}
        user={user}
        isStreaming={isStreaming}
      />,
      {withSafeArea: true, withNavigation: true, withBottomSheetProvider: true},
    );

  const reportScrolledAway = (away: boolean) =>
    act(() => reactions[reactions.length - 1](away, !away));

  it('leaves the list unanchored while a reply streams at the newest message', () => {
    const {UNSAFE_root} = renderChat(true);

    expect(
      chatList(UNSAFE_root).props.maintainVisibleContentPosition,
    ).toBeUndefined();
  });

  it('anchors the visible rows while a reply streams and the user has scrolled away', () => {
    const {UNSAFE_root} = renderChat(true);

    reportScrolledAway(true);
    expect(chatList(UNSAFE_root).props.maintainVisibleContentPosition).toEqual({
      minIndexForVisible: 1,
    });

    reportScrolledAway(false);
    expect(
      chatList(UNSAFE_root).props.maintainVisibleContentPosition,
    ).toBeUndefined();
  });

  it('leaves the list unanchored when nothing streams', () => {
    const {UNSAFE_root} = renderChat(false);

    reportScrolledAway(true);

    expect(
      chatList(UNSAFE_root).props.maintainVisibleContentPosition,
    ).toBeUndefined();
  });
});
