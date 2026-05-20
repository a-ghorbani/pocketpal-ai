import React from 'react';

import {Text} from 'react-native-paper';

import {render} from '../../../../jest/test-utils';

import {Bubble} from '../Bubble';

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
