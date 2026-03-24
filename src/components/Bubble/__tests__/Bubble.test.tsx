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
          input_token_count: 42,
          output_token_count: 128,
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
    expect(getByText('in: 42t')).toBeTruthy();
    expect(getByText('out: 128t 1.28s 100.00t/s 10ms/t')).toBeTruthy();
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

    // Should display the time to first token in addition to the regular timing info
    expect(getByText(/in:.*250ms/)).toBeTruthy();
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

    const {queryByText} = renderBubble(messageWithNullTimeToFirstToken);

    // Should not display time to first token when it's null
    expect(queryByText(/to first token/)).toBeNull();
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

    const {queryByText} = renderBubble(messageWithoutTimeToFirstToken);

    // Should not display time to first token when it's undefined
    expect(queryByText(/to first token/)).toBeNull();
  });

  it('renders context truncation details on a second debug line when present', () => {
    const truncatedMessage = {
      ...mockMessage,
      metadata: {
        ...mockMessage.metadata,
        context_truncation: {
          history_retained_percent: 40,
          input_retained_percent: 75,
          prompt_retained_percent: 90,
        },
      },
    };

    const {getByText} = renderBubble(truncatedMessage);

    expect(
      getByText('Context truncated: history 40%, input 75%, prompt 90%'),
    ).toBeTruthy();
  });

  it('does not render the bottom bar when there are no timings and no versions', () => {
    const plainMessage = {
      ...mockMessage,
      metadata: {
        copyable: false,
      },
    };

    const {queryByTestId} = renderBubble(plainMessage);

    expect(queryByTestId('message-timing')).toBeNull();
  });

  it('navigates to previous and next versions', () => {
    const onVersionChange = jest.fn();
    const versionedMessage = {
      ...mockMessage,
      metadata: {
        ...mockMessage.metadata,
        versions: [
          {text: 'v1', createdAt: 1},
          {text: 'v2', createdAt: 2},
        ],
      },
    };

    const {getByText} = render(
      <Bubble
        child={<Text testID="child">Child content</Text>}
        message={versionedMessage}
        nextMessageInGroup={false}
        onVersionChange={onVersionChange}
      />,
    );

    fireEvent.press(getByText('chevron-left'));
    expect(onVersionChange).toHaveBeenCalledWith(1);

    onVersionChange.mockClear();

    const activeVersionMessage = {
      ...versionedMessage,
      metadata: {
        ...versionedMessage.metadata,
        activeVersionIndex: 0,
      },
    };

    const {getByText: getByTextActive} = render(
      <Bubble
        child={<Text testID="child">Child content</Text>}
        message={activeVersionMessage}
        nextMessageInGroup={false}
        onVersionChange={onVersionChange}
      />,
    );

    fireEvent.press(getByTextActive('chevron-right'));
    expect(onVersionChange).toHaveBeenCalledWith(1);
  });

  it('returns to the latest version when advancing from the final saved version', () => {
    const onVersionChange = jest.fn();
    const messageAtLastSavedVersion = {
      ...mockMessage,
      metadata: {
        ...mockMessage.metadata,
        versions: [
          {text: 'v1', createdAt: 1},
          {text: 'v2', createdAt: 2},
        ],
        activeVersionIndex: 1,
      },
    };

    const {getByText} = render(
      <Bubble
        child={<Text testID="child">Child content</Text>}
        message={messageAtLastSavedVersion}
        nextMessageInGroup={false}
        onVersionChange={onVersionChange}
      />,
    );

    fireEvent.press(getByText('chevron-right'));
    expect(onVersionChange).toHaveBeenCalledWith(undefined);
  });

  it('does not change version when there is no version history', () => {
    const onVersionChange = jest.fn();
    const plainMessage = {
      ...mockMessage,
      metadata: {
        ...mockMessage.metadata,
        versions: [],
      },
    };

    const {queryByText} = render(
      <Bubble
        child={<Text testID="child">Child content</Text>}
        message={plainMessage}
        nextMessageInGroup={false}
        onVersionChange={onVersionChange}
      />,
    );

    expect(queryByText('chevron-left')).toBeNull();
    expect(queryByText('chevron-right')).toBeNull();
    expect(onVersionChange).not.toHaveBeenCalled();
  });

  it('does not go past the first saved version', () => {
    const onVersionChange = jest.fn();
    const firstSavedVersionMessage = {
      ...mockMessage,
      metadata: {
        ...mockMessage.metadata,
        versions: [
          {text: 'v1', createdAt: 1},
          {text: 'v2', createdAt: 2},
        ],
        activeVersionIndex: 0,
      },
    };

    const {getByText} = render(
      <Bubble
        child={<Text testID="child">Child content</Text>}
        message={firstSavedVersionMessage}
        nextMessageInGroup={false}
        onVersionChange={onVersionChange}
      />,
    );

    fireEvent.press(getByText('chevron-left'));
    expect(onVersionChange).not.toHaveBeenCalled();
  });
});
