import React from 'react';
import {runInAction} from 'mobx';

import {act, fireEvent, render} from '../../../../jest/test-utils';
import {modelsList} from '../../../../jest/fixtures/models';
import {
  asrStore,
  modelStore,
  voiceEntitlement,
  voiceModeStore,
} from '../../../store';

import {ChatScreen} from '../ChatScreen';

const mockPickerVisible: boolean[] = [];
jest.mock('../../../components/ChatPalModelPickerSheet', () => ({
  ChatPalModelPickerSheet: ({isVisible}: {isVisible: boolean}) => {
    mockPickerVisible.push(isVisible);
    return null;
  },
}));

const mockSheetsShown: string[] = [];
jest.mock('../../../components/VoiceSetupSheet', () => ({
  VoiceSetupSheet: ({isVisible}: {isVisible: boolean}) => {
    if (isVisible) {
      mockSheetsShown.push('setup');
    }
    return null;
  },
}));
jest.mock('../../../components/VoiceMemorySheet', () => ({
  VoiceMemorySheet: ({fit}: {fit: unknown}) => {
    if (fit) {
      mockSheetsShown.push('memory');
    }
    return null;
  },
}));

const pickerOpen = () =>
  mockPickerVisible[mockPickerVisible.length - 1] ?? false;

const renderScreen = () =>
  render(<ChatScreen />, {
    withNavigation: true,
    withBottomSheetProvider: true,
  });

describe('ChatScreen voice mode entry', () => {
  beforeEach(() => {
    mockPickerVisible.length = 0;
    mockSheetsShown.length = 0;
    (voiceModeStore as any).reset();
    runInAction(() => {
      modelStore.deviceTier = 'high';
      modelStore.isContextLoading = false;
      asrStore.captureState = 'idle';
      asrStore.downloadStates.base = 'ready';
    });
  });

  it('with no model loaded, opens only the model picker', async () => {
    voiceModeStore.setUnlockOverride(true);
    runInAction(() => {
      modelStore.activeModelId = undefined;
    });
    const {getByTestId} = renderScreen();
    expect(pickerOpen()).toBe(false);

    await act(async () => {
      fireEvent.press(getByTestId('voice-mode-button'));
    });

    expect(pickerOpen()).toBe(true);
    expect(voiceModeStore.phase).toBe('closed');
    expect(mockSheetsShown).toEqual([]);
  });

  it('when locked, opens the paywall once and stays closed', async () => {
    voiceModeStore.setUnlockOverride(false);
    runInAction(() => {
      modelStore.models = modelsList as any;
      modelStore.activeModelId = modelsList[0].id;
    });
    const {getByTestId} = renderScreen();

    await act(async () => {
      fireEvent.press(getByTestId('voice-mode-button'));
    });

    expect(
      (voiceEntitlement as any).defaultSource.openPaywall,
    ).toHaveBeenCalledTimes(1);
    expect(voiceModeStore.phase).toBe('closed');
    expect(pickerOpen()).toBe(false);
  });

  it('shows the voice view over the chat while open in full view', () => {
    runInAction(() => {
      voiceModeStore.phase = 'listening';
    });
    const {getByTestId, queryByTestId} = renderScreen();
    expect(getByTestId('voice-view')).toBeTruthy();
    expect(queryByTestId('voice-bar')).toBeNull();
    expect(
      getByTestId('voice-bar', {includeHiddenElements: true}),
    ).toBeTruthy();
  });
});
