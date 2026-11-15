import * as React from 'react';
import {Platform} from 'react-native';
import {runInAction} from 'mobx';
import Speech from '@pocketpalai/react-native-speech';

import {fireEvent} from '../../../../jest/test-utils';
import {flushTimers, measureScenario} from '../../../../jest/perf';
import {ttsStore} from '../../../store';

import {VoicePickerView} from '../VoicePickerView';
import {GOOGLE_TTS_CATALOG} from './googleTtsCatalog';

const OS_VOICES = GOOGLE_TTS_CATALOG.map(
  ([name, language, networkConnectionRequired, notInstalled]) => ({
    quality: 'Enhanced',
    name,
    identifier: name,
    language,
    networkConnectionRequired,
    notInstalled,
  }),
);

describe('VoicePickerView render performance', () => {
  const originalOS = Platform.OS;

  beforeAll(() => {
    Platform.OS = 'android';
  });

  afterAll(() => {
    Platform.OS = originalOS;
  });

  it('opens the System group on a full Google TTS catalog and picks a language', async () => {
    await measureScenario(<VoicePickerView />, {
      wrapperOptions: {withBottomSheetProvider: true, withSafeArea: true},
      beforeEach: () => {
        (Speech.getAvailableVoices as jest.Mock).mockResolvedValue(OS_VOICES);
        runInAction(() => {
          ttsStore.currentVoice = {
            id: 'en-us-x-sfg-local',
            name: 'en-us-x-sfg-local',
            engine: 'system',
            language: 'en-US',
          };
        });
      },
      scenario: async screen => {
        await flushTimers();
        expect(
          screen.getByTestId('tts-voice-row-system-en-us-x-sfg-local'),
        ).toBeTruthy();

        fireEvent.press(screen.getByTestId('tts-system-language-button'));
        await flushTimers();
        fireEvent.press(screen.getByTestId('tts-system-language-option-es'));
        await flushTimers();
        expect(screen.getByTestId('tts-system-section-es-es')).toBeTruthy();
        expect(screen.queryByTestId('tts-system-section-en-us')).toBeNull();
      },
    });
  });
});
