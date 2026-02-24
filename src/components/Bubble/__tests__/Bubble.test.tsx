import React from 'react';

import {Text} from 'react-native-paper';

import {render, fireEvent} from '../../../../jest/test-utils';

import {Bubble} from '../Bubble';

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => {
  const {Text: PaperText} = require('react-native-paper');
  return props => <PaperText>{props.name}</PaperText>;
});

jest.mock('@react-native-clipboard/clipboard', () => ({
  setString: jest.fn(),
}));

describe('Bubble', () => {
  let mockMessage;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMessage = {
      author: {id: 'user1'},
      createdAt: 0,
      id: 'uuidv4',
      text: 'Hello, world!',
      type: 'text',
      metadata: {
        copyable: true,
        timings: {
          predicted_per_token_ms: 10,
          predicted_per_second: 100,
        },
      },
    };
  });

  const renderBubble = (message, child = 'Child content') => {
    return render(
      <Bubble
        child={<Text testID="child">{child}</Text>}
        message={message}
        nextMessageInGroup={false}
      />,
    );
  };

  it('renders correctly with all props', () => {
    const {getByText, getByTestId} = renderBubble(mockMessage);
    expect(getByTestId('child')).toBeTruthy();
    expect(getByText('10ms/token, 100.00 tokens/sec')).toBeTruthy();
    expect(getByText('content-copy')).toBeTruthy();
  });

  it('does not render copy icon when message is not copyable', () => {
    const nonCopyableMessage = {
      ...mockMessage,
      metadata: {...mockMessage.metadata, copyable: false},
    };
    const {queryByText} = renderBubble(nonCopyableMessage);
    expect(queryByText('content-copy')).toBeNull();
  });

  it('calls Clipboard.setString when copy icon is pressed', () => {
    const {getByText} = renderBubble(mockMessage);
    fireEvent.press(getByText('content-copy'));
    expect(
      require('@react-native-clipboard/clipboard').setString,
    ).toHaveBeenCalledWith('Hello, world!');
  });

  it('does not crash when message.metadata is undefined', () => {
    const messageWithoutMetadata = {...mockMessage, metadata: undefined};
    const {getByText} = renderBubble(messageWithoutMetadata);
    expect(getByText('Child content')).toBeTruthy();
  });

  it('displays time to first token when available', () => {
    const messageWithTimeToFirstToken = {
      ...mockMessage,
      metadata: {
        copyable: true,
        timings: {
          predicted_per_token_ms: 10,
          predicted_per_second: 100,
          time_to_first_token_ms: 250,
        },
      },
    };

    const {getByText} = renderBubble(messageWithTimeToFirstToken);

    expect(getByText('10ms/token, 100.00 tokens/sec, 250ms TTFT')).toBeTruthy();
  });

  it('does not display time to first token when null', () => {
    const messageWithNullTimeToFirstToken = {
      ...mockMessage,
      metadata: {
        copyable: true,
        timings: {
          predicted_per_token_ms: 10,
          predicted_per_second: 100,
          time_to_first_token_ms: null,
        },
      },
    };

    const {getByText} = renderBubble(messageWithNullTimeToFirstToken);

    // Should show timing without TTFT
    expect(getByText('10ms/token, 100.00 tokens/sec')).toBeTruthy();
  });

  it('does not display time to first token when undefined', () => {
    const messageWithoutTimeToFirstToken = {
      ...mockMessage,
      metadata: {
        copyable: true,
        timings: {
          predicted_per_token_ms: 10,
          predicted_per_second: 100,
          // time_to_first_token_ms is undefined
        },
      },
    };

    const {getByText} = renderBubble(messageWithoutTimeToFirstToken);

    // Should show timing without TTFT
    expect(getByText('10ms/token, 100.00 tokens/sec')).toBeTruthy();
  });

  it('shows only TTFT when server timings are not available', () => {
    const messageWithTtftOnly = {
      ...mockMessage,
      metadata: {
        copyable: true,
        timings: {
          time_to_first_token_ms: 150,
        },
      },
    };

    const {getByText} = renderBubble(messageWithTtftOnly);

    expect(getByText('150ms TTFT')).toBeTruthy();
  });

  it('hides footer when timings not yet set (streaming in progress)', () => {
    const messageWithCopyableOnly = {
      ...mockMessage,
      metadata: {
        copyable: true,
      },
    };

    const {queryByTestId} = renderBubble(messageWithCopyableOnly);

    // Footer is gated on timings, not copyable — prevents showing
    // an awkward copy icon before streaming has started/finished
    expect(queryByTestId('message-timing')).toBeNull();
  });

  it('shows copy button when timings exist but have no server values', () => {
    const messageWithEmptyTimings = {
      ...mockMessage,
      metadata: {
        copyable: true,
        timings: {},
      },
    };

    const {getByText, queryByTestId} = renderBubble(messageWithEmptyTimings);

    // Footer shows because timings object exists (set after completion)
    expect(queryByTestId('message-timing')).toBeTruthy();
    expect(getByText('content-copy')).toBeTruthy();
  });

  it('hides footer when metadata is empty', () => {
    const messageWithNoFooter = {
      ...mockMessage,
      metadata: {},
    };

    const {queryByTestId} = renderBubble(messageWithNoFooter);

    expect(queryByTestId('message-timing')).toBeNull();
  });
});
