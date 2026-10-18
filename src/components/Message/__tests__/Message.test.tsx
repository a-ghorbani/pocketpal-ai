import {render} from '@testing-library/react-native';
import * as React from 'react';

import {derivedTextMessage} from '../../../../jest/fixtures';
import {render as renderWithProviders} from '../../../../jest/test-utils';
import {Message} from '../Message';

jest.mock('../../TextMessage/TextMessage', () => ({
  TextMessage: () => null,
}));

describe('message', () => {
  it('renders undefined in ContentContainer', () => {
    expect.assertions(2);
    const {getByTestId} = render(
      <Message
        message={{...derivedTextMessage, type: 'custom'}}
        messageWidth={440}
        onMessagePress={jest.fn}
        roundBorder
        showAvatar
        showName
        showStatus
      />,
    );
    const ContentContainer = getByTestId('ContentContainer');
    expect(ContentContainer).toBeDefined();
    expect(ContentContainer.props.children).toBeNull();
  });

  it('renders undefined in ContentContainer with wrong message type', () => {
    expect.assertions(2);
    const {getByTestId} = render(
      <Message
        message={{...derivedTextMessage, type: 'unsupported'}}
        messageWidth={440}
        onMessagePress={jest.fn}
        roundBorder
        showAvatar
        showName
        showStatus
      />,
    );
    const ContentContainer = getByTestId('ContentContainer');
    expect(ContentContainer).toBeDefined();
    expect(ContentContainer.props.children).toBeNull();
  });

  describe('spoken marker', () => {
    const renderRow = (message: any) =>
      renderWithProviders(
        <Message
          message={message}
          messageWidth={440}
          onMessagePress={jest.fn}
          roundBorder
          showAvatar
          showName
          showStatus
        />,
      );

    it('marks a text row spoken in voice mode', () => {
      const {getByTestId} = renderRow({
        ...derivedTextMessage,
        metadata: {spoken: true},
      });
      expect(getByTestId('spoken-marker')).toBeTruthy();
    });

    it('marks an assistant turn spoken in voice mode', () => {
      const {getByTestId} = renderRow({
        ...derivedTextMessage,
        type: 'assistant_turn',
        steps: [{content: 'Paris.'}],
        metadata: {spoken: true},
      });
      expect(getByTestId('spoken-marker')).toBeTruthy();
    });

    it('marks no row without the spoken flag', () => {
      const {queryByTestId} = renderRow({
        ...derivedTextMessage,
        type: 'assistant_turn',
        steps: [{content: 'Paris.'}],
        metadata: {},
      });
      expect(queryByTestId('spoken-marker')).toBeNull();
    });

    it('marks no other row type', () => {
      const {queryByTestId} = renderRow({
        ...derivedTextMessage,
        type: 'custom',
        metadata: {spoken: true},
      });
      expect(queryByTestId('spoken-marker')).toBeNull();
    });
  });
});
