import React from 'react';
import {runInAction} from 'mobx';

import {fireEvent, render} from '../../../../jest/test-utils';

import {L10nContext} from '../../../utils';
import {l10n} from '../../../locales';
import {asrStore} from '../../../store';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({navigate: mockNavigate}),
}));

import {MicButton} from '../MicButton';

const renderMic = (onStart = jest.fn()) =>
  render(
    <L10nContext.Provider value={l10n.en}>
      <MicButton onStart={onStart} />
    </L10nContext.Provider>,
    {withNavigation: true},
  );

describe('MicButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runInAction(() => {
      asrStore.deviceMeetsMemory = true;
      asrStore.userASROverride = null;
      asrStore.selectedTier = 'small';
      asrStore.downloadStates.small = 'ready';
      asrStore.captureState = 'idle';
    });
  });

  it('renders nothing when voice input is unavailable', () => {
    runInAction(() => {
      asrStore.deviceMeetsMemory = false;
      asrStore.userASROverride = false;
    });
    const {queryByTestId} = renderMic();
    expect(queryByTestId('mic-button')).toBeNull();
    expect(queryByTestId('mic-button-setup')).toBeNull();
  });

  it('shows a setup affordance (not a recording mic) when not installed', () => {
    runInAction(() => {
      asrStore.downloadStates.small = 'not_installed';
    });
    const onStart = jest.fn();
    const {getByTestId, queryByTestId} = renderMic(onStart);
    expect(getByTestId('mic-button-setup')).toBeTruthy();
    expect(queryByTestId('mic-button')).toBeNull();
    fireEvent.press(getByTestId('mic-button-setup'));
    expect(mockNavigate).toHaveBeenCalledWith('Settings');
    expect(onStart).not.toHaveBeenCalled();
  });

  it('starts a capture on tap when gate open and tier ready', () => {
    const onStart = jest.fn();
    const {getByTestId, queryByTestId} = renderMic(onStart);
    expect(queryByTestId('mic-button-setup')).toBeNull();
    fireEvent.press(getByTestId('mic-button'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('is disabled while the permission prompt is open', () => {
    runInAction(() => {
      asrStore.captureState = 'requesting_perm';
    });
    const onStart = jest.fn();
    const {getByTestId} = renderMic(onStart);
    fireEvent.press(getByTestId('mic-button'));
    expect(onStart).not.toHaveBeenCalled();
  });
});
