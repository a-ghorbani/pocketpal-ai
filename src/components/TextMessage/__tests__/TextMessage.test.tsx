import * as utils from '@flyerhq/react-native-link-preview/lib/utils';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import * as React from 'react';
import {Linking} from 'react-native';

import {derivedTextMessage} from '../../../../jest/fixtures';
import {render as renderWithProviders} from '../../../../jest/test-utils';
import {TextMessage} from '../TextMessage';

describe('text message', () => {
  // eslint-disable-next-line jest/no-disabled-tests
  it.skip('renders preview image and handles link press', async () => {
    const link = 'https://github.com/flyerhq/';
    const getPreviewDataMock = jest
      .spyOn(utils, 'getPreviewData')
      .mockResolvedValue({
        description: 'description',
        image: {
          height: 460,
          url: 'https://avatars2.githubusercontent.com/u/59206044',
          width: 460,
        },
        link,
        title: 'title',
      });
    const openUrlMock = jest.spyOn(Linking, 'openURL');
    const {getByRole, getByText, debug} = render(
      <TextMessage
        message={{
          ...derivedTextMessage,
          author: {id: 'newUserId', firstName: 'John'},
          text: link,
        }}
        messageWidth={440}
        onPreviewDataFetched={jest.fn}
        showName
        usePreviewData
      />,
    );
    debug();
    const image = getByRole('image');
    expect(image).toBeDefined();
    const text = getByText(link);
    fireEvent.press(text);
    expect(openUrlMock).toHaveBeenCalledWith(link);
    getPreviewDataMock.mockRestore();
    openUrlMock.mockRestore();
  });

  // eslint-disable-next-line jest/no-disabled-tests
  it.skip('renders preview image without https and handles link press', async () => {
    expect.assertions(2);
    const link = 'github.com/flyerhq/';
    const getPreviewDataMock = jest
      .spyOn(utils, 'getPreviewData')
      .mockResolvedValue({
        description: 'description',
        image: {
          height: 460,
          url: 'https://avatars2.githubusercontent.com/u/59206044',
          width: 460,
        },
        link,
        title: 'title',
      });
    const openUrlMock = jest.spyOn(Linking, 'openURL');
    const {getByRole, getByText} = render(
      <TextMessage
        message={{...derivedTextMessage, text: link}}
        messageWidth={440}
        onPreviewDataFetched={jest.fn}
        showName={false}
        usePreviewData
      />,
    );
    await waitFor(() => getByRole('image'));
    const image = getByRole('image');
    expect(image).toBeDefined();
    const text = getByText(link);
    fireEvent.press(text);
    expect(openUrlMock).toHaveBeenCalledWith('https://' + link);
    getPreviewDataMock.mockRestore();
    openUrlMock.mockRestore();
  });

  it('renders a step through its visible content, not raw content', () => {
    const echo = '{"name": "web_search", "arguments": {"query": "Firecrawl"}}';
    const call = {
      id: 'c0',
      function: {name: 'web_search', arguments: '{"query": "Firecrawl"}'},
    };
    const {queryByText, rerender} = renderWithProviders(
      <TextMessage
        message={derivedTextMessage}
        messageWidth={440}
        showName={false}
        usePreviewData={false}
        step={{content: echo}}
      />,
    );
    expect(queryByText(/web_search/)).not.toBeNull();

    rerender(
      <TextMessage
        message={derivedTextMessage}
        messageWidth={440}
        showName={false}
        usePreviewData={false}
        step={{content: echo, toolCalls: [call]}}
      />,
    );
    expect(queryByText(/web_search/)).toBeNull();
  });

  it('renders call-shaped JSON in a message without a step', () => {
    const echo = '{"name": "web_search", "arguments": {"query": "Firecrawl"}}';
    const {queryByText} = renderWithProviders(
      <TextMessage
        message={{...derivedTextMessage, text: echo}}
        messageWidth={440}
        showName={false}
        usePreviewData={false}
      />,
    );
    expect(queryByText(/web_search/)).not.toBeNull();
  });

  it('renders and handles email press', async () => {
    expect.assertions(1);
    const email = 'john@flyer.chat';
    const getPreviewDataMock = jest
      .spyOn(utils, 'getPreviewData')
      .mockResolvedValue({});
    const openUrlMock = jest.spyOn(Linking, 'openURL');
    const {getByText} = render(
      <TextMessage
        message={{
          ...derivedTextMessage,
          author: {id: 'newUserId', firstName: 'John'},
          text: email,
        }}
        messageWidth={440}
        onPreviewDataFetched={jest.fn}
        showName
        usePreviewData
      />,
    );
    await waitFor(() => getByText(email));
    const text = getByText(email);
    fireEvent.press(text);
    expect(openUrlMock).toHaveBeenCalledWith(`mailto:${email}`);
    getPreviewDataMock.mockRestore();
    openUrlMock.mockRestore();
  });
});

describe('document chips', () => {
  const report = {
    id: 'd1',
    name: 'report.pdf',
    kind: 'pdf' as const,
    byteSize: 1,
    pageCount: 12,
    charCount: 12400,
    tokenEstimate: 3100,
  };

  it('shows each attached document as a static chip above the typed text', () => {
    const {getByText, queryByTestId} = renderWithProviders(
      <TextMessage
        message={{
          ...derivedTextMessage,
          text: 'Summarise',
          documents: [report],
        }}
        messageWidth={440}
        showName={false}
        usePreviewData={false}
      />,
    );
    expect(getByText('report.pdf')).toBeTruthy();
    expect(getByText('12 pages · ~3.1k tokens')).toBeTruthy();
    expect(getByText('Summarise')).toBeTruthy();
    expect(queryByTestId('message-document-chip-remove')).toBeNull();
  });

  it('renders a document whose files are gone exactly as stored', () => {
    const {getByText} = renderWithProviders(
      <TextMessage
        message={{
          ...derivedTextMessage,
          text: 'old',
          documents: [{...report, id: 'missing'}],
        }}
        messageWidth={440}
        showName={false}
        usePreviewData={false}
      />,
    );
    expect(getByText('12 pages · ~3.1k tokens')).toBeTruthy();
  });
});
