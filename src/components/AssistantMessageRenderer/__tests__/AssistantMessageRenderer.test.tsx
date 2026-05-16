import React from 'react';
import {fireEvent, render} from '../../../../jest/test-utils';

import {uiStore} from '../../../store';
import {defaultMessageRenderingSettings} from '../../../utils/messageRendering';
import {AssistantMessageRenderer} from '../AssistantMessageRenderer';

describe('AssistantMessageRenderer', () => {
  beforeEach(() => {
    uiStore.messageRenderingSettings = {...defaultMessageRenderingSettings};
  });

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

  it('shows service tokens in rendered mode when token hiding is disabled', () => {
    uiStore.messageRenderingSettings = {
      ...defaultMessageRenderingSettings,
      hideModelTemplateTokens: false,
    };

    const {getByText} = render(
      <AssistantMessageRenderer
        content="<|assistant|>\nVisible answer"
        messageId="message-3"
        maxMessageWidth={320}
      />,
    );

    expect(getByText('<|assistant|>')).toBeTruthy();
    expect(getByText(/Visible answer/)).toBeTruthy();
  });

  it('renders tool calls as structured copyable blocks', () => {
    const {getByText, getByLabelText} = render(
      <AssistantMessageRenderer
        content={
          '<tool_call>\n{"name":"calculator","arguments":{"x":2}}\n</tool_call>'
        }
        messageId="message-4"
        maxMessageWidth={320}
      />,
    );

    expect(getByText('tool_call')).toBeTruthy();
    expect(getByText('json')).toBeTruthy();
    expect(getByLabelText('Copy raw tool_call segment')).toBeTruthy();
  });
});
