import React from 'react';
import {render, fireEvent} from '../../../../jest/test-utils';
import {RouterModelPreparing} from '../RouterModelPreparing';
import {modelStore, serverStore} from '../../../store';

const BINDING = {
  modelId: 'srv-1/alpha',
  serverId: 'srv-1',
  remoteModelId: 'alpha',
  url: 'http://desktop:8080',
  serverType: 'llama.cpp',
};

const loadOp = () => ({
  kind: 'load' as const,
  phase: 'requested' as const,
  serverId: 'srv-1',
  key: 'srv-1/alpha',
  startedAt: Date.now(),
  requestSeq: 0,
  lastEvidenceAt: Date.now(),
});

describe('RouterModelPreparing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    modelStore.activeRemoteBinding = undefined;
    serverStore.routerOps = {};
    serverStore.routerEvents = {};
  });

  it('renders nothing without a remote binding', () => {
    const {queryByTestId} = render(<RouterModelPreparing />);

    expect(queryByTestId('router-model-preparing')).toBeNull();
  });

  it('renders nothing while no load is in flight', () => {
    modelStore.activeRemoteBinding = BINDING;
    const {queryByTestId} = render(<RouterModelPreparing />);

    expect(queryByTestId('router-model-preparing')).toBeNull();
  });

  it('shows an indeterminate bar before any progress has arrived', () => {
    modelStore.activeRemoteBinding = BINDING;
    serverStore.routerOps = {'srv-1/alpha': loadOp()};

    const {getByTestId} = render(<RouterModelPreparing />);

    expect(
      getByTestId('router-model-preparing-progress').props.accessibilityValue,
    ).toEqual({});
  });

  // The first tick of a real load reports zero, which is a value and not the
  // absence of one.
  it('shows a determinate bar at zero on the first tick', () => {
    modelStore.activeRemoteBinding = BINDING;
    serverStore.routerOps = {'srv-1/alpha': loadOp()};
    serverStore.routerEvents = {
      'srv-1/alpha': {progress: {value: 0}, at: Date.now()},
    };

    const {getByTestId} = render(<RouterModelPreparing />);

    expect(
      getByTestId('router-model-preparing-progress').props.accessibilityValue,
    ).toEqual({min: 0, max: 100, now: 0});
  });

  it('offers a way out of the wait', () => {
    modelStore.activeRemoteBinding = BINDING;
    serverStore.routerOps = {'srv-1/alpha': loadOp()};

    const {getByTestId} = render(<RouterModelPreparing />);
    fireEvent.press(getByTestId('router-model-preparing-cancel'));

    expect(serverStore.cancelRouterOp).toHaveBeenCalledWith('srv-1', 'alpha');
  });
});
