import React from 'react';

import {act, within} from '@testing-library/react-native';

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

  it('shows the percent and a bar at that fraction', () => {
    seedLoad({value: 0.4});

    const {getByTestId} = render(<RouterLoadStatus />);

    expect(getByTestId('chat-router-loading-label')).toHaveTextContent(
      'Loading model · 40%',
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
      'Loading model · 75%',
    );
  });

  it('shows no percent before the first progress reading', () => {
    seedLoad();

    const {getByTestId} = render(<RouterLoadStatus />);

    expect(getByTestId('chat-router-loading-label')).toHaveTextContent(
      'Loading model…',
    );
    expect(getByTestId('chat-router-loading-label')).not.toHaveTextContent('%');
  });

  it('names no model in the line', () => {
    seedLoad({value: 0.4});

    const {getByTestId} = render(<RouterLoadStatus />);

    expect(getByTestId('chat-router-loading')).not.toHaveTextContent(
      BINDING.remoteModelId,
    );
  });

  it('keeps the line to a single line', () => {
    seedLoad({value: 0.65});

    const {getByTestId} = render(<RouterLoadStatus />);

    expect(getByTestId('chat-router-loading-label').props.numberOfLines).toBe(
      1,
    );
  });

  it('announces politely and offers no control', () => {
    seedLoad({value: 0.4});

    const {getByTestId, queryAllByRole} = render(<RouterLoadStatus />);

    expect(
      getByTestId('chat-router-loading-status').props.accessibilityLiveRegion,
    ).toBe('polite');
    expect(queryAllByRole('button')).toEqual([]);
  });

  it('announces the same words while the percent moves', () => {
    seedLoad({value: 0.4});
    const {getByTestId} = render(<RouterLoadStatus />);
    const status = getByTestId('chat-router-loading-status');
    const announced = status.props.accessibilityLabel;

    act(() => seedLoad({value: 0.6}));

    expect(getByTestId('chat-router-loading-label')).toHaveTextContent(
      'Loading model · 60%',
    );
    expect(announced).toBe('Loading model…');
    expect(
      getByTestId('chat-router-loading-status').props.accessibilityLabel,
    ).toBe(announced);
    expect(
      getByTestId('chat-router-loading-bar').props.accessibilityValue.now,
    ).toBe(60);
  });

  it('keeps the bar outside the announced region', () => {
    seedLoad({value: 0.4});

    const {getByTestId} = render(<RouterLoadStatus />);

    expect(
      within(getByTestId('chat-router-loading-status')).queryByTestId(
        'chat-router-loading-bar',
      ),
    ).toBeNull();
  });
});
