import React from 'react';
import {fireEvent, render} from '../../../../jest/test-utils';

import {AssistantMessageRenderer} from '../AssistantMessageRenderer';

describe('AssistantMessageRenderer', () => {
  it('exposes rendered, clean, and raw modes for tagged assistant output', () => {
    const content = '<think>hidden reasoning</think>\nVisible **answer**';
    const {getByText, queryByText} = render(
      <AssistantMessageRenderer
        content={content}
        messageId="message-1"
        maxMessageWidth={320}
      />,
    );

    expect(getByText('Rendered')).toBeTruthy();
    expect(getByText('Clean')).toBeTruthy();
    expect(getByText('Raw')).toBeTruthy();
    expect(queryByText(content)).toBeNull();

    fireEvent.press(getByText('Raw'));

    expect(getByText(content)).toBeTruthy();

    fireEvent.press(getByText('Clean'));

    expect(getByText('Visible answer')).toBeTruthy();
  });

  it('does not show mode controls for simple clean markdown', () => {
    const {queryByText} = render(
      <AssistantMessageRenderer
        content="Visible **answer**"
        messageId="message-2"
        maxMessageWidth={320}
      />,
    );

    expect(queryByText('Rendered')).toBeNull();
    expect(queryByText('Raw')).toBeNull();
  });
});
