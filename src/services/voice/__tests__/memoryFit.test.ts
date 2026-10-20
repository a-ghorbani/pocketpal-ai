import {ASR_TIERS} from '../../asr/constants';
import {whisperFits} from '../../asr/whisperFits';
import {TTS_ENGINE_RUNTIME_BYTES} from '../../tts/constants';
import {voiceMemoryFit} from '../memoryFit';

const sttBytes = ASR_TIERS.base.runtimeBytes;
const ttsBytes = TTS_ENGINE_RUNTIME_BYTES.supertonic;
const android = (totalBytes: number) => ({os: 'android' as const, totalBytes});
const ios = (ceilingBytes: number) => ({os: 'ios' as const, ceilingBytes});

describe('voiceMemoryFit', () => {
  it("won't fit a 3.23 GB chat model on a 7.4 GB Android phone", () => {
    const fit = voiceMemoryFit({
      memory: android(7.4e9),
      chatBytes: 3.23e9,
      sttBytes,
      ttsBytes,
    });
    expect(fit.status).toBe('wont_fit');
  });

  it('fits a 1.4 GB chat model on the same phone', () => {
    const fit = voiceMemoryFit({
      memory: android(7.4e9),
      chatBytes: 1.4e9,
      sttBytes,
      ttsBytes,
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
    });
    expect(fit.status).toBe('tight');
  });

  it('on iOS counts the chat model, whisper and the voice against the ceiling', () => {
    const fit = voiceMemoryFit({
      memory: ios(4e9),
      chatBytes: 2e9,
      sttBytes,
      ttsBytes,
    });
    expect(fit.status).toBe('fits');
    expect(fit.breakdown).toEqual({
      rows: [
        {kind: 'chat', bytes: 2e9},
        {kind: 'stt', bytes: sttBytes},
        {kind: 'tts', bytes: ttsBytes},
      ],
      neededBytes: 2e9 + sttBytes + ttsBytes,
      availableBytes: 4e9,
    });
  });

  it('is tight on iOS when whisper fits under the ceiling but the voice does not', () => {
    const fit = voiceMemoryFit({
      memory: ios(4e9),
      chatBytes: 4e9 - sttBytes - ttsBytes / 2,
      sttBytes,
      ttsBytes,
    });
    expect(fit.status).toBe('tight');
  });

  it("on iOS won't fit when whisper alone passes the ceiling", () => {
    const fit = voiceMemoryFit({
      memory: ios(4e9),
      chatBytes: 4e9 - sttBytes + 1,
      sttBytes,
      ttsBytes,
    });
    expect(fit.status).toBe('wont_fit');
  });

  it('fits on iOS while the load ceiling is unknown', () => {
    const fit = voiceMemoryFit({
      memory: ios(0),
      chatBytes: 9e9,
      sttBytes,
      ttsBytes,
    });
    expect(fit.status).toBe('fits');
  });

  it('fits when memory could not be read', () => {
    const fit = voiceMemoryFit({
      memory: null,
      chatBytes: 9e9,
      sttBytes,
      ttsBytes,
    });
    expect(fit.status).toBe('fits');
  });

  it.each([
    [android(7.4e9), 3.23e9],
    [android(7.4e9), 1.4e9],
    [android(4e9), 1.5e9],
    [ios(4e9), 3.9e9],
    [ios(4e9), 2e9],
    [ios(0), 9e9],
  ])(
    "won't fit exactly where dictation refuses whisper (%o, %d)",
    (memory, chatBytes) => {
      const fit = voiceMemoryFit({
        memory,
        chatBytes,
        sttBytes,
        ttsBytes,
      });
      expect(fit.status === 'wont_fit').toBe(
        !whisperFits(memory, chatBytes, sttBytes),
      );
    },
  );
});
