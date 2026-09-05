import * as React from 'react';
import {textMessage, user} from '../../../../jest/fixtures';
import {ChatView} from '../ChatView';
import {render, within} from '../../../../jest/test-utils';
import {modelStore, serverStore} from '../../../store';

jest.useFakeTimers();

jest.mock('../../ChatEmptyPlaceholder', () => ({
  ChatEmptyPlaceholder: jest.fn(() => null),
}));

const BINDING = {
  modelId: 'srv-1/alpha',
  serverId: 'srv-1',
  remoteModelId: 'alpha',
  url: 'http://desktop:8080',
} as any;

const loadInFlight = () => {
  modelStore.activeRemoteBinding = BINDING;
  serverStore.routerOps = {
    'srv-1/alpha': {
      kind: 'load',
      attempt: 1,
      phase: 'active',
      serverId: 'srv-1',
      key: 'srv-1/alpha',
      startedAt: Date.now(),
      requestSeq: 0,
      lastEvidenceAt: Date.now(),
    },
  };
};

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
  afterEach(() => {
    modelStore.activeRemoteBinding = undefined;
    serverStore.routerOps = {};
  });

  it('renders nothing while no load is in flight', () => {
    modelStore.activeRemoteBinding = BINDING;

    const {queryByTestId} = renderChat();

    expect(queryByTestId('router-model-preparing')).toBeNull();
  });

  // Rendered as a sibling of the chat view it took the window's bottom edge,
  // where the system navigation bar draws over it: under three-button
  // navigation the Cancel button was entirely unreachable. Inside the input
  // container it sits above the input, within the padding that container
  // already derives from the safe-area inset.
  it('renders inside the input container, not beside the chat view', () => {
    loadInFlight();

    const {getByTestId} = renderChat();

    expect(
      within(getByTestId('chat-input-container')).getByTestId(
        'router-model-preparing',
      ),
    ).toBeTruthy();
  });

  // The container's bottom padding comes from an animated style, which this
  // environment resolves to an empty object — so the inset it reserves is not
  // observable here and the device captures are what verify the tap lands.
  // What is observable is the order: the banner sits above the input, not
  // below it where the navigation bar draws.
  it('sits above the chat input rather than below it', () => {
    loadInFlight();

    const {getByTestId} = renderChat();
    const container = getByTestId('chat-input-container');
    const order = container
      .findAll(
        (node: any) =>
          node.props?.testID === 'router-model-preparing' ||
          node.props?.testID === 'chat-input',
      )
      .map((node: any) => node.props.testID);

    // A testID appears on both the composite and its host node, so the same
    // two names repeat; the order they first appear in is the contract.
    expect([...new Set(order)]).toEqual([
      'router-model-preparing',
      'chat-input',
    ]);
  });
});
