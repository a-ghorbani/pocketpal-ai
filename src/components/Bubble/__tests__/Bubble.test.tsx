import React from 'react';

import {StyleSheet} from 'react-native';
import {Text} from 'react-native-paper';

import {render} from '../../../../jest/test-utils';
import {themeFixtures} from '../../../../jest/fixtures/theme';

import {Bubble} from '../Bubble';

// The default UserContext user fixture id (jest/fixtures.ts).
const CURRENT_USER_ID = 'userId';

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
      metadata: {},
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

  // Bubble is a pure shape primitive — chrome lives on
  // AssistantTurnFooter. Tests assert shape behaviour only.

  it('renders the child content', () => {
    const {getByTestId} = renderBubble(mockMessage);
    expect(getByTestId('child')).toBeTruthy();
  });

  it('renders an ai-message testID for non-current-user authors', () => {
    const aiMessage = {...mockMessage, author: {id: 'assistant'}};
    const {getByTestId} = renderBubble(aiMessage);
    expect(getByTestId('ai-message')).toBeTruthy();
  });

  it('does not crash when message.metadata is undefined', () => {
    const messageWithoutMetadata = {...mockMessage, metadata: undefined};
    const {getByText} = renderBubble(messageWithoutMetadata);
    expect(getByText('Child content')).toBeTruthy();
  });

  it('renders a grey-tail bubble for the current user (filled bg, squared trailing corner)', () => {
    const userMessage = {...mockMessage, author: {id: CURRENT_USER_ID}};
    const {getByTestId} = renderBubble(userMessage);
    const node = getByTestId('user-message');
    const flat = StyleSheet.flatten(node.props.style);
    // Grey fill + 2px tail via the LOGICAL corner so it mirrors under RTL.
    expect(flat.backgroundColor).toBe(
      themeFixtures.lightTheme.colors.mutedLight,
    );
    expect(flat.borderRadius).toBe(16);
    expect(flat.borderEndEndRadius).toBe(2);
    // Must NOT use the physical corner (would not mirror under RTL).
    expect(flat.borderBottomRightRadius).toBeUndefined();
  });

  it('renders the assistant bubble borderless and transparent (text sits flush on the surface)', () => {
    const aiMessage = {...mockMessage, author: {id: 'assistant'}};
    const {getByTestId} = renderBubble(aiMessage);
    const node = getByTestId('ai-message');
    const flat = StyleSheet.flatten(node.props.style);
    expect(flat.backgroundColor).toBe('transparent');
    expect(flat.borderColor).toBe('transparent');
    // No tail on the assistant bubble — all corners stay at 16.
    expect(flat.borderEndEndRadius).toBe(16);
  });

  it('does NOT render timing or copy chrome (chrome lives in AssistantTurnFooter now)', () => {
    const messageWithTimings = {
      ...mockMessage,
      metadata: {
        copyable: true,
        timings: {predicted_per_token_ms: 10, predicted_per_second: 100},
      },
    };
    const {queryByText, queryByTestId} = renderBubble(messageWithTimings);
    expect(queryByTestId('message-timing')).toBeNull();
    expect(queryByText('content-copy')).toBeNull();
    expect(queryByText('10ms/token, 100.00 tokens/sec')).toBeNull();
  });
});
