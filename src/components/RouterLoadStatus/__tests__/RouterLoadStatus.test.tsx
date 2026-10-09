import React from 'react';

import {render} from '../../../../jest/test-utils';
import {RouterLoadStatus} from '../RouterLoadStatus';
import {modelStore, routerStore} from '../../../store';

const BINDING = {
  modelId: 'srv-1/alpha',
  serverId: 'srv-1',
  remoteModelId: 'alpha',
  url: 'http://desktop:8080',
  serverType: 'llama.cpp' as const,
};

const seedLoad = (progress?: Record<string, unknown>) => {
  routerStore.records.set('srv-1/alpha', {
    key: 'srv-1/alpha',
    kind: 'load',
    detail: progress ? {progress} : undefined,
  } as any);
};

describe('RouterLoadStatus', () => {
  beforeEach(() => {
    routerStore.records.clear();
    modelStore.activeRemoteBinding = BINDING;
  });

  afterEach(() => {
    routerStore.records.clear();
    modelStore.activeRemoteBinding = undefined;
  });

  it('shows the model, the percent and a bar at that fraction', () => {
    seedLoad({value: 0.4});

    const {getByTestId} = render(<RouterLoadStatus />);

    expect(getByTestId('chat-router-loading-label')).toHaveTextContent(
      'Loading alpha on the server · 40%',
    );
    expect(
      getByTestId('chat-router-loading-bar').props.accessibilityValue,
    ).toEqual({min: 0, max: 100, now: 40});
  });

  it('shows the overall percent of a load with several stages', () => {
    seedLoad({
      stages: ['text_model', 'mmproj_model'],
      current: 'mmproj_model',
      value: 0.5,
    });

    const {getByTestId} = render(<RouterLoadStatus />);

    expect(getByTestId('chat-router-loading-label')).toHaveTextContent(
      'Loading alpha on the server · 75%',
    );
  });

  it('shows no percent before the first progress reading', () => {
    seedLoad();

    const {getByTestId} = render(<RouterLoadStatus />);

    expect(getByTestId('chat-router-loading-label')).toHaveTextContent(
      'Loading alpha on the server…',
    );
    expect(getByTestId('chat-router-loading-label')).not.toHaveTextContent('%');
  });

  it('announces politely and offers no control', () => {
    seedLoad({value: 0.4});

    const {getByTestId, queryAllByRole} = render(<RouterLoadStatus />);

    expect(
      getByTestId('chat-router-loading').props.accessibilityLiveRegion,
    ).toBe('polite');
    expect(queryAllByRole('button')).toEqual([]);
  });
});
