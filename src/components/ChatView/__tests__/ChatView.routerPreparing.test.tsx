import * as React from 'react';
import {textMessage, user} from '../../../../jest/fixtures';
import {ChatView} from '../ChatView';
import {render} from '../../../../jest/test-utils';
import {modelStore, routerStore} from '../../../store';

jest.useFakeTimers();

jest.mock('../../ChatEmptyPlaceholder', () => ({
  ChatEmptyPlaceholder: jest.fn(() => null),
}));

const renderChat = () =>
  render(
    <ChatView
      messages={[textMessage]}
      onSendPress={jest.fn()}
      user={user}
      showUserAvatars
      showUserNames
    />,
    {withNavigation: true},
  );

describe('the preparing banner inside the chat view', () => {
  beforeEach(() => {
    modelStore.activeRemoteBinding = {
      modelId: 'srv-1/alpha',
      serverId: 'srv-1',
      remoteModelId: 'alpha',
      url: 'http://desktop:8080',
      serverType: 'llama.cpp',
    };
    routerStore.records.set('srv-1/alpha', {
      key: 'srv-1/alpha',
      kind: 'load',
    } as any);
  });

  afterEach(() => {
    modelStore.activeRemoteBinding = undefined;
    routerStore.records.clear();
  });

  // Inside the composer wrapper it shares the padding that keeps the input
  // clear of the system navigation bar; beside the chat view it would sit
  // under that bar, where Cancel cannot be tapped.
  it('shares the chat input wrapper and sits above the input', () => {
    const {getAllByTestId, getByTestId} = renderChat();

    const banner = getByTestId('router-model-preparing');
    const wrapper = (() => {
      let node: any = banner.parent;
      while (node && node.props?.onLayout === undefined) {
        node = node.parent;
      }
      return node;
    })();
    const order = wrapper
      .findAll(
        (node: any) =>
          node.props?.testID === 'router-model-preparing' ||
          node.props?.testID === 'chat-input',
      )
      .map((node: any) => node.props.testID);

    expect([...new Set(order)]).toEqual([
      'router-model-preparing',
      'chat-input',
    ]);
    expect(getAllByTestId('chat-input').length).toBeGreaterThan(0);
  });
});
