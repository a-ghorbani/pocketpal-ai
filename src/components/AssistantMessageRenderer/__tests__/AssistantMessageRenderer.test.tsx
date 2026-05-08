import React from 'react';
import Clipboard from '@react-native-clipboard/clipboard';
import {fireEvent, render} from '../../../../jest/test-utils';

import {uiStore} from '../../../store';
import {defaultMessageRenderingSettings} from '../../../utils/messageRendering';
import {AssistantMessageRenderer} from '../AssistantMessageRenderer';

describe('AssistantMessageRenderer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('renders JSON and XML as structured blocks', () => {
    const jsonRender = render(
      <AssistantMessageRenderer
        content='{"name":"search","arguments":{"query":"PocketPal"}}'
        messageId="message-json"
        maxMessageWidth={320}
      />,
    );

    expect(jsonRender.getByText('JSON')).toBeTruthy();
    expect(jsonRender.getByText('json')).toBeTruthy();
    expect(jsonRender.getByLabelText('Copy raw JSON segment')).toBeTruthy();
    jsonRender.unmount();

    const xmlRender = render(
      <AssistantMessageRenderer
        content="<response><answer>42</answer></response>"
        messageId="message-xml"
        maxMessageWidth={320}
      />,
    );

    expect(xmlRender.getByText('XML')).toBeTruthy();
    expect(xmlRender.getByText('xml')).toBeTruthy();
    expect(xmlRender.getByLabelText('Copy raw XML segment')).toBeTruthy();
  });

  it('shows raw fallback for malformed JSON without crashing', () => {
    const {getByText, queryByText} = render(
      <AssistantMessageRenderer
        content='{"name":'
        messageId="message-json-fallback"
        maxMessageWidth={320}
      />,
    );

    expect(getByText('{"name":')).toBeTruthy();
    expect(queryByText('JSON fallback')).toBeNull();
  });

  it('copies tables as Markdown and plain text from rendered controls', () => {
    const table = '| A | B |\n|---|---|\n| 1 | 2 |';
    const {getByLabelText} = render(
      <AssistantMessageRenderer
        content={table}
        messageId="message-table"
        maxMessageWidth={320}
      />,
    );

    fireEvent.press(getByLabelText('Copy Table as MD'));
    expect(Clipboard.setString).toHaveBeenLastCalledWith(table);

    fireEvent.press(getByLabelText('Copy Table as Text'));
    expect(Clipboard.setString).toHaveBeenLastCalledWith('A\tB\n1\t2');
  });

  it('copies block math as raw TeX from rendered controls', () => {
    const math = '$$E = mc^2$$';
    const {getByLabelText} = render(
      <AssistantMessageRenderer
        content={math}
        messageId="message-math"
        maxMessageWidth={320}
      />,
    );

    fireEvent.press(getByLabelText('Copy Math as TeX'));
    expect(Clipboard.setString).toHaveBeenLastCalledWith(math);
  });
});
