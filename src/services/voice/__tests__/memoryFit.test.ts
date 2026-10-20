import {ASR_TIERS} from '../../asr/constants';
import {whisperFits} from '../../asr/whisperFits';
import {TTS_ENGINE_RUNTIME_BYTES} from '../../tts/constants';
import {voiceMemoryFit} from '../memoryFit';

const sttBytes = ASR_TIERS.base.runtimeBytes;
const ttsBytes = TTS_ENGINE_RUNTIME_BYTES.supertonic;
const android = (totalBytes: number) => ({os: 'android' as const, totalBytes});
const ios = (availableBytes: number) => ({os: 'ios' as const, availableBytes});

describe('voiceMemoryFit', () => {
  it("won't fit a 3.23 GB chat model on a 7.4 GB Android phone", () => {
    const fit = voiceMemoryFit({
      memory: android(7.4e9),
      chatBytes: 3.23e9,
      sttBytes,
      ttsBytes,
      ttsLoaded: false,
    });
    expect(fit.status).toBe('wont_fit');
  });

  it('fits a 1.4 GB chat model on the same phone', () => {
    const fit = voiceMemoryFit({
      memory: android(7.4e9),
      chatBytes: 1.4e9,
      sttBytes,
      ttsBytes,
      ttsLoaded: false,
    });
    expect(fit.status).toBe('fits');
    expect(fit.breakdown).toEqual({
      rows: [
        {kind: 'chat', bytes: 1.4e9},
        {kind: 'stt', bytes: sttBytes},
        {kind: 'tts', bytes: ttsBytes},
      ],
      neededBytes: 1.4e9 + sttBytes + ttsBytes,
      availableBytes: 7.4e9 * 0.45,
    });
  });

  it('is tight on Android when whisper fits but the voice does not', () => {
    const budget = 7.4e9 * 0.45;
    const fit = voiceMemoryFit({
      memory: android(7.4e9),
      chatBytes: budget - sttBytes - ttsBytes / 2,
      sttBytes,
      ttsBytes,
      ttsLoaded: false,
    });
    expect(fit.status).toBe('tight');
  });

  it('on iOS counts the voice only when its engine is not loaded', () => {
    const available = (sttBytes + ttsBytes / 2) * 1.2;
    const inputs = {
      memory: ios(available),
      chatBytes: 2e9,
      sttBytes,
      ttsBytes,
    };
    expect(voiceMemoryFit({...inputs, ttsLoaded: false}).status).toBe('tight');
    expect(voiceMemoryFit({...inputs, ttsLoaded: true}).status).toBe('fits');
  });

  it('on iOS counts only whisper and an unloaded voice, with headroom', () => {
    const inputs = {memory: ios(3e9), chatBytes: 2e9, sttBytes, ttsBytes};
    expect(voiceMemoryFit({...inputs, ttsLoaded: false}).breakdown).toEqual({
      rows: [
        {kind: 'stt', bytes: sttBytes * 1.2},
        {kind: 'tts', bytes: ttsBytes * 1.2},
      ],
      neededBytes: (sttBytes + ttsBytes) * 1.2,
      availableBytes: 3e9,
    });
    expect(
      voiceMemoryFit({...inputs, ttsLoaded: true}).breakdown.rows[1],
    ).toEqual({kind: 'tts', bytes: 0});
  });

  it("on iOS won't fit when whisper alone lacks headroom", () => {
    const fit = voiceMemoryFit({
      memory: ios(sttBytes),
      chatBytes: 0,
      sttBytes,
      ttsBytes,
      ttsLoaded: true,
    });
    expect(fit.status).toBe('wont_fit');
  });

  it('fits when memory could not be read', () => {
    const fit = voiceMemoryFit({
      memory: null,
      chatBytes: 9e9,
      sttBytes,
      ttsBytes,
      ttsLoaded: false,
    });
    expect(fit.status).toBe('fits');
  });

  it.each([
    [android(7.4e9), 3.23e9],
    [android(7.4e9), 1.4e9],
    [android(4e9), 1.5e9],
    [ios(0.3e9), 0],
    [ios(2e9), 0],
  ])(
    "won't fit exactly where dictation refuses whisper (%o, %d)",
    (memory, chatBytes) => {
      const fit = voiceMemoryFit({
        memory,
        chatBytes,
        sttBytes,
        ttsBytes,
        ttsLoaded: false,
      });
      expect(fit.status === 'wont_fit').toBe(
        !whisperFits(memory, chatBytes, sttBytes),
      );
    },
  );
});
