import {runInAction} from 'mobx';

import {ttsStore} from '../../../store';
import {hasVoiceFile} from '../../tts/voiceFiles';
import type {Voice} from '../../tts/types';
import {isVoiceModeVoiceReady} from '../readiness';

jest.mock('../../tts/voiceFiles', () => ({
  hasVoiceFile: jest.fn(),
  ensureVoiceFile: jest.fn(),
}));

const bella: Voice = {id: 'af_bella', name: 'Bella', engine: 'kokoro'};
const zoey: Voice = {id: 'Zoey', name: 'Zoey', engine: 'phonon'};
const system: Voice = {id: 'com.apple.x', name: 'X', engine: 'system'};

describe('isVoiceModeVoiceReady', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (hasVoiceFile as jest.Mock).mockResolvedValue(true);
    runInAction(() => {
      ttsStore.phononSupported = true;
    });
  });

  it('is true for an offered neural voice whose file is on disk', async () => {
    await expect(isVoiceModeVoiceReady(bella)).resolves.toBe(true);
    expect(hasVoiceFile).toHaveBeenCalledWith(bella);
  });

  it("is false when the voice's file is missing", async () => {
    (hasVoiceFile as jest.Mock).mockResolvedValue(false);
    await expect(isVoiceModeVoiceReady(bella)).resolves.toBe(false);
  });

  it.each([
    ['no voice', null],
    ['the system voice', system],
  ])('is false for %s without checking the disk', async (_label, voice) => {
    await expect(isVoiceModeVoiceReady(voice)).resolves.toBe(false);
    expect(hasVoiceFile).not.toHaveBeenCalled();
  });

  it('is false for a voice whose engine is not offered here', async () => {
    runInAction(() => {
      ttsStore.phononSupported = false;
    });
    await expect(isVoiceModeVoiceReady(zoey)).resolves.toBe(false);
    expect(hasVoiceFile).not.toHaveBeenCalled();
  });
});
