import React from 'react';

import {runInAction} from 'mobx';

import {fireEvent, render} from '../../../../jest/test-utils';
import {modelStore, voiceModeStore} from '../../../store';

import {VoiceModeButton} from '../VoiceModeButton';

describe('VoiceModeButton', () => {
  beforeEach(() => {
    (voiceModeStore as any).reset();
    runInAction(() => {
      modelStore.deviceTier = 'high';
      modelStore.isContextLoading = false;
    });
    voiceModeStore.setUnlockOverride(true);
  });

  it('renders nothing on a device that cannot run voice mode', () => {
    runInAction(() => {
      modelStore.deviceTier = 'low';
    });
    const {queryByTestId} = render(<VoiceModeButton onPress={jest.fn()} />);
    expect(queryByTestId('voice-mode-button')).toBeNull();
  });

  it('starts voice mode on press, without a lock when unlocked', () => {
    const onPress = jest.fn();
    const {getByTestId, queryByTestId} = render(
      <VoiceModeButton onPress={onPress} />,
    );
    fireEvent.press(getByTestId('voice-mode-button'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(queryByTestId('voice-mode-lock')).toBeNull();
  });

  it('shows a lock badge when locked, and still takes the tap', () => {
    voiceModeStore.setUnlockOverride(false);
    const onPress = jest.fn();
    const {getByTestId} = render(<VoiceModeButton onPress={onPress} />);
    expect(getByTestId('voice-mode-lock')).toBeTruthy();
    fireEvent.press(getByTestId('voice-mode-button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is disabled while the model loads', () => {
    runInAction(() => {
      modelStore.isContextLoading = true;
    });
    const {getByTestId} = render(<VoiceModeButton onPress={jest.fn()} />);
    expect(getByTestId('voice-mode-button')).toBeDisabled();
  });
});
