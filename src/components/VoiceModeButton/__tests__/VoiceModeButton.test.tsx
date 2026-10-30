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

  it('shows on a weaker device once turned on in Settings', () => {
    runInAction(() => {
      modelStore.deviceTier = 'low';
    });
    voiceModeStore.setUserVoiceModeOverride(true);
    const {getByTestId} = render(<VoiceModeButton onPress={jest.fn()} />);
    expect(getByTestId('voice-mode-button')).toBeTruthy();
  });

  it('hides on a capable device once turned off in Settings', () => {
    voiceModeStore.setUserVoiceModeOverride(false);
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

  it('shows a Plus badge when locked, says what it opens, and still takes the tap', () => {
    voiceModeStore.setUnlockOverride(false);
    const onPress = jest.fn();
    const {getByTestId} = render(<VoiceModeButton onPress={onPress} />);
    const button = getByTestId('voice-mode-button');
    expect(getByTestId('voice-mode-lock')).toBeTruthy();
    expect(button.props.accessibilityLabel).toBe(
      'Hands-free voice, PocketPal Plus',
    );
    expect(button.props.accessibilityHint).toBe(
      'Opens a short preview. Typing and dictation stay free.',
    );
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('keeps the primary look and no hint when unlocked', () => {
    const {getByTestId} = render(<VoiceModeButton onPress={jest.fn()} />);
    const button = getByTestId('voice-mode-button');
    expect(button.props.accessibilityLabel).toBe('Start voice mode');
    expect(button.props.accessibilityHint).toBeUndefined();
    expect(button).toHaveStyle({backgroundColor: '#333333'});
  });

  it('is disabled while the model loads', () => {
    runInAction(() => {
      modelStore.isContextLoading = true;
    });
    const {getByTestId} = render(<VoiceModeButton onPress={jest.fn()} />);
    expect(getByTestId('voice-mode-button')).toBeDisabled();
  });
});
