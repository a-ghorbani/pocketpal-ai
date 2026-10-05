import React from 'react';
import {render, fireEvent} from '../../../../jest/test-utils';
import {RouterModelPreparing} from '../RouterModelPreparing';
import {modelStore, routerStore} from '../../../store';
import {l10n} from '../../../locales';

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

describe('RouterModelPreparing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    routerStore.records.clear();
    modelStore.activeRemoteBinding = BINDING;
  });

  afterEach(() => {
    modelStore.activeRemoteBinding = undefined;
  });

  it('shows the preparing line, the bar and Cancel for a load in flight', () => {
    seed('srv-1/alpha', {kind: 'load', detail: {progress: {value: 0}}});

    const {getByTestId} = render(<RouterModelPreparing />);

    expect(getByTestId('router-model-preparing-label')).toHaveTextContent(
      l10n.en.chat.preparingModel,
    );
    expect(
      getByTestId('router-model-preparing-progress').props.accessibilityValue,
    ).toEqual({min: 0, max: 100, now: 0});
    fireEvent.press(getByTestId('router-model-preparing-cancel'));
    expect(routerStore.cancel).toHaveBeenCalledWith('srv-1', 'alpha');
    expect(routerStore.unload).not.toHaveBeenCalled();
  });

  it('says the load goes on after Stop, without claiming the message was dropped', () => {
    seed('srv-1/alpha', {kind: 'load', droppedTurn: true});

    const {getByTestId} = render(<RouterModelPreparing />);

    expect(getByTestId('router-model-preparing-label')).toHaveTextContent(
      l10n.en.chat.preparingDroppedTurn,
    );
    expect(l10n.en.chat.preparingDroppedTurn).not.toMatch(/not sent/i);
    expect(getByTestId('router-model-preparing-progress')).toBeTruthy();
  });

  it('shows a failed load with its reason and Dismiss, and no retry', () => {
    seed('srv-1/alpha', {
      kind: 'load',
      failure: {cause: 'load-failed', message: 'exit code 1'},
    });

    const {getByTestId, queryByTestId, queryByText} = render(
      <RouterModelPreparing />,
    );

    const reason = getByTestId('router-model-preparing-reason');
    expect(reason.type).toBe('Text');
    expect(reason).toHaveTextContent('This model did not load. exit code 1');
    expect(queryByTestId('router-model-preparing-cancel')).toBeNull();
    expect(queryByText(/retry/i)).toBeNull();
    fireEvent.press(getByTestId('router-model-preparing-dismiss'));
    expect(routerStore.dismiss).toHaveBeenCalledWith('srv-1', 'alpha');
  });

  it('announces the banner politely, and a failure as an alert', () => {
    seed('srv-1/alpha', {kind: 'load'});
    const running = render(<RouterModelPreparing />);
    const runningBanner = running.getByTestId('router-model-preparing');
    expect(runningBanner.props.accessibilityLiveRegion).toBe('polite');
    expect(runningBanner.props.accessibilityRole).toBeUndefined();
    running.unmount();

    seed('srv-1/alpha', {kind: 'load', failure: {cause: 'load-failed'}});
    const failed = render(<RouterModelPreparing />);
    const banner = failed.getByTestId('router-model-preparing');
    expect(banner.props.accessibilityLiveRegion).toBe('polite');
    expect(banner.props.accessibilityRole).toBe('alert');
  });

  it.each([
    ['an unload', 'srv-1/alpha', {kind: 'unload'}],
    ['a load of another model', 'srv-1/beta', {kind: 'load'}],
    ['nothing', 'srv-1/none', undefined],
  ])('renders nothing for %s', (_label, key, record) => {
    if (record) {
      seed(key, record);
    }

    const {queryByTestId} = render(<RouterModelPreparing />);

    expect(queryByTestId('router-model-preparing')).toBeNull();
  });

  it('renders nothing without a remote session', () => {
    seed('srv-1/alpha', {kind: 'load'});
    modelStore.activeRemoteBinding = undefined;

    const {queryByTestId} = render(<RouterModelPreparing />);

    expect(queryByTestId('router-model-preparing')).toBeNull();
  });
});
