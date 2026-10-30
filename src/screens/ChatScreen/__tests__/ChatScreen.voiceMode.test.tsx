import React from 'react';
import {TextInput} from 'react-native';
import {runInAction} from 'mobx';

import {act, fireEvent, render, waitFor} from '../../../../jest/test-utils';
import {modelsList} from '../../../../jest/fixtures/models';
import {
  asrStore,
  modelStore,
  purchaseStore,
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

  describe('when locked', () => {
    const openPaywall = () =>
      (voiceEntitlement as any).defaultSource.openPaywall as jest.Mock;
    const tapLocked = async () => {
      voiceModeStore.setUnlockOverride(false);
      runInAction(() => {
        modelStore.models = modelsList as any;
        modelStore.activeModelId = modelsList[0].id;
      });
      const screen = renderScreen();
      await act(async () => {
        fireEvent.press(screen.getByTestId('voice-mode-button'));
      });
      return screen;
    };

    beforeEach(() => {
      openPaywall().mockClear();
      (TextInput.prototype.focus as jest.Mock).mockClear();
    });

    it('shows the teaser over a hidden chat, not the paywall, every time', async () => {
      const {getByTestId, queryByTestId} = await tapLocked();

      expect(getByTestId('voice-teaser')).toBeTruthy();
      expect(queryByTestId('chat-input')).toBeNull();
      expect(openPaywall()).not.toHaveBeenCalled();
      expect(voiceModeStore.phase).toBe('closed');
      expect(pickerOpen()).toBe(false);

      fireEvent.press(getByTestId('voice-teaser-close'));
      expect(queryByTestId('voice-teaser')).toBeNull();
      await act(async () => {
        fireEvent.press(getByTestId('voice-mode-button'));
      });
      expect(getByTestId('voice-teaser')).toBeTruthy();
    });

    it('Get Plus closes the teaser and opens the paywall once', async () => {
      const {getByTestId, queryByTestId} = await tapLocked();

      fireEvent.press(getByTestId('voice-teaser-get-plus'));

      expect(queryByTestId('voice-teaser')).toBeNull();
      expect(openPaywall()).toHaveBeenCalledTimes(1);
      expect(voiceModeStore.phase).toBe('closed');
    });

    it('Keep typing closes the teaser and focuses the composer', async () => {
      const {getByTestId, queryByTestId} = await tapLocked();

      fireEvent.press(getByTestId('voice-teaser-keep-typing'));

      expect(queryByTestId('voice-teaser')).toBeNull();
      await waitFor(() =>
        expect(TextInput.prototype.focus).toHaveBeenCalledTimes(1),
      );
      expect(openPaywall()).not.toHaveBeenCalled();
    });

    it('the close button returns to the chat without focusing it', async () => {
      const {getByTestId, queryByTestId} = await tapLocked();

      fireEvent.press(getByTestId('voice-teaser-close'));

      expect(queryByTestId('voice-teaser')).toBeNull();
      expect(getByTestId('chat-input')).toBeTruthy();
      expect(TextInput.prototype.focus).not.toHaveBeenCalled();
      expect(openPaywall()).not.toHaveBeenCalled();
    });
  });

  it('with Plus unlocked, shows no lock and goes past the paywall', async () => {
    runInAction(() => {
      purchaseStore.plusUnlocked = true;
      modelStore.models = modelsList as any;
      modelStore.activeModelId = modelsList[0].id;
    });
    const {getByTestId, queryByTestId} = renderScreen();
    expect(queryByTestId('voice-mode-lock')).toBeNull();

    await act(async () => {
      fireEvent.press(getByTestId('voice-mode-button'));
    });

    expect(
      (voiceEntitlement as any).defaultSource.openPaywall,
    ).not.toHaveBeenCalled();
    expect(
      mockSheetsShown.length > 0 || voiceModeStore.phase !== 'closed',
    ).toBe(true);
    runInAction(() => {
      purchaseStore.plusUnlocked = false;
    });
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
