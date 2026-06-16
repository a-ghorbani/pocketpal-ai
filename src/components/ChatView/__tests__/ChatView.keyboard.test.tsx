import * as React from 'react';
import {Platform} from 'react-native';

import {textMessage, user} from '../../../../jest/fixtures';
import {ChatView} from '../ChatView';
import {render} from '../../../../jest/test-utils';

jest.useFakeTimers();

jest.mock('../../ChatEmptyPlaceholder', () => ({
  ChatEmptyPlaceholder: jest.fn(() => null),
}));

// keyboardDismissMode is set once on the chat FlatList but the FlatList passes
// it down to its inner ScrollView/VirtualizedList hosts, so several tree nodes
// carry it. They all carry the SAME value, which is the contract under test.
const dismissModes = (root: any) =>
  root
    .findAll((n: any) => n.props && n.props.keyboardDismissMode !== undefined)
    .map((n: any) => n.props.keyboardDismissMode);

// The chat FlatList is the node carrying BOTH keyboardDismissMode and the data
// array — child message rows also carry `inverted` but not keyboardDismissMode.
const chatFlatLists = (root: any) =>
  root.findAll(
    (n: any) =>
      n.props &&
      n.props.keyboardDismissMode !== undefined &&
      Array.isArray(n.props.data),
  );

describe('ChatView keyboard occlusion', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalOS;
  });

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

  it('keeps the iOS interactive drag-to-dismiss gesture', () => {
    Platform.OS = 'ios';
    const {UNSAFE_root} = render(
      <ChatView messages={messages} onSendPress={jest.fn()} user={user} />,
      {withSafeArea: true, withNavigation: true, withBottomSheetProvider: true},
    );

    const modes = dismissModes(UNSAFE_root);
    expect(modes.length).toBeGreaterThan(0);
    expect(modes.every((m: string) => m === 'interactive')).toBe(true);
  });

  it('relaxes Android keyboardDismissMode to none so a drag scrolls instead of dismissing', () => {
    Platform.OS = 'android';
    const {UNSAFE_root} = render(
      <ChatView messages={messages} onSendPress={jest.fn()} user={user} />,
      {withSafeArea: true, withNavigation: true, withBottomSheetProvider: true},
    );

    const modes = dismissModes(UNSAFE_root);
    expect(modes.length).toBeGreaterThan(0);
    expect(modes.every((m: string) => m === 'none')).toBe(true);
  });

  it('renders one inverted chat list when messages are present', () => {
    Platform.OS = 'android';
    const {UNSAFE_root} = render(
      <ChatView messages={messages} onSendPress={jest.fn()} user={user} />,
      {withSafeArea: true, withNavigation: true, withBottomSheetProvider: true},
    );

    const lists = chatFlatLists(UNSAFE_root);
    expect(lists.length).toBeGreaterThan(0);
    expect(lists.every((n: any) => n.props.inverted === true)).toBe(true);
  });

  it('renders without crashing on Android with an empty chat (empty-state gate)', () => {
    Platform.OS = 'android';
    const {UNSAFE_root} = render(
      <ChatView messages={[]} onSendPress={jest.fn()} user={user} />,
      {withSafeArea: true, withNavigation: true, withBottomSheetProvider: true},
    );

    // Empty chat is not inverted (inverted is gated on messages.length > 0).
    const lists = chatFlatLists(UNSAFE_root);
    expect(lists.length).toBeGreaterThan(0);
    expect(lists.every((n: any) => n.props.inverted === false)).toBe(true);
    // The Android dismiss-mode relaxation still applies in the empty state.
    const modes = dismissModes(UNSAFE_root);
    expect(modes.length).toBeGreaterThan(0);
    expect(modes.every((m: string) => m === 'none')).toBe(true);
  });
});
