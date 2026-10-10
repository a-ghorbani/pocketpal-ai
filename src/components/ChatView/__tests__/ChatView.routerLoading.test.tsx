import * as React from 'react';
import {runInAction} from 'mobx';

import {textMessage, user} from '../../../../jest/fixtures';
import {render} from '../../../../jest/test-utils';
import {chatSessionStore, modelStore, routerStore} from '../../../store';
import {ChatView} from '../ChatView';

jest.useFakeTimers();

jest.mock('../../ChatEmptyPlaceholder', () => ({
  ChatEmptyPlaceholder: jest.fn(() => null),
}));

const BINDING = {
  modelId: 'srv-1/alpha',
  serverId: 'srv-1',
  remoteModelId: 'alpha',
  url: 'http://desktop:8080',
  serverType: 'llama.cpp' as const,
};

const seed = (key: string, record: Record<string, unknown>) => {
  routerStore.records.set(key, {key, ...record} as any);
};

const renderChat = () =>
  render(
    <ChatView messages={[textMessage]} onSendPress={jest.fn()} user={user} />,
    {withNavigation: true, withBottomSheetProvider: true},
  );

describe('the pending slot while the bound router model loads', () => {
  beforeEach(() => {
    routerStore.records.clear();
    runInAction(() => {
      modelStore.activeRemoteBinding = BINDING;
      chatSessionStore.isStopping = false;
      chatSessionStore.agentUiState = {
        status: 'prefill',
        pendingTalentNames: [],
        hitMaxTurns: false,
      };
    });
  });

  afterEach(() => {
    routerStore.records.clear();
    runInAction(() => {
      modelStore.activeRemoteBinding = undefined;
      chatSessionStore.isStopping = false;
      chatSessionStore.agentUiState = {
        status: 'idle',
        pendingTalentNames: [],
        hitMaxTurns: false,
      };
    });
  });

  it('shows the load line instead of the dots', () => {
    seed('srv-1/alpha', {kind: 'load', detail: {progress: {value: 0.4}}});

    const {queryByTestId} = renderChat();

    expect(queryByTestId('chat-router-loading')).toBeTruthy();
    expect(queryByTestId('pending-indicator')).toBeNull();
  });

  it.each([
    [
      'an unload of the bound model',
      () => seed('srv-1/alpha', {kind: 'unload'}),
    ],
    ['a load of another model', () => seed('srv-1/beta', {kind: 'load'})],
    [
      'a failed load',
      () =>
        seed('srv-1/alpha', {
          kind: 'load',
          failure: {cause: 'load-failed', message: ''},
        }),
    ],
    ['a session with no router load', () => {}],
    [
      'a Stop',
      () => {
        seed('srv-1/alpha', {kind: 'load'});
        runInAction(() => {
          chatSessionStore.isStopping = true;
        });
      },
    ],
  ])('shows the dots for %s', (_label, arrange) => {
    arrange();

    const {queryByTestId} = renderChat();

    expect(queryByTestId('chat-router-loading')).toBeNull();
    expect(queryByTestId('pending-indicator')).toBeTruthy();
  });

  it('shows nothing once the turn is no longer pending', () => {
    seed('srv-1/alpha', {kind: 'load'});
    runInAction(() => {
      chatSessionStore.agentUiState = {
        status: 'idle',
        pendingTalentNames: [],
        hitMaxTurns: false,
      };
    });

    const {queryByTestId} = renderChat();

    expect(queryByTestId('chat-router-loading')).toBeNull();
  });
});
