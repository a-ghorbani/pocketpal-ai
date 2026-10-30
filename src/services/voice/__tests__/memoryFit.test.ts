import {ASR_IOS_CEILING_SHARE, ASR_TIERS} from '../../asr/constants';
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
      sttTier: 'base',
      ttsBytes,
    });
    expect(fit.status).toBe('wont_fit');
  });

  it('fits a 1.4 GB chat model on the same phone', () => {
    const fit = voiceMemoryFit({
      memory: android(7.4e9),
      chatBytes: 1.4e9,
      sttTier: 'base',
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
      sttTier: 'base',
      ttsBytes,
    });
    expect(fit.status).toBe('tight');
  });

  it('on iOS counts the chat model, whisper and the voice against pre-load free memory', () => {
    const fit = voiceMemoryFit({
      memory: ios(4e9),
      chatBytes: 2e9,
      sttTier: 'base',
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
      availableBytes: 4e9 * ASR_IOS_CEILING_SHARE,
    });
  });

  it('is tight on iOS when whisper fits under pre-load free memory but the voice does not', () => {
    const fit = voiceMemoryFit({
      memory: ios(4e9),
      chatBytes: 4e9 * ASR_IOS_CEILING_SHARE - sttBytes - ttsBytes / 2,
      sttTier: 'base',
      ttsBytes,
    });
    expect(fit.status).toBe('tight');
  });

  it("on iOS won't fit when whisper alone passes pre-load free memory", () => {
    const fit = voiceMemoryFit({
      memory: ios(4e9),
      chatBytes: 4e9 * ASR_IOS_CEILING_SHARE - sttBytes + 1,
      sttTier: 'base',
      ttsBytes,
    });
    expect(fit.status).toBe('wont_fit');
  });

  it.each([
    ['1.7B', 1.9e9, 'fits'],
    ['4B Q4', 3.2e9, 'wont_fit'],
  ] as const)(
    'on iOS with 4.2 GB free before any load, chat model %s with Base → %s',
    (_name, chatBytes, status) => {
      const fit = voiceMemoryFit({
        memory: ios(4.2e9),
        chatBytes,
        sttTier: 'base',
        ttsBytes,
      });
      expect(fit.status).toBe(status);
    },
  );

  it('fits on iOS while pre-load free memory is unknown', () => {
    const fit = voiceMemoryFit({
      memory: ios(0),
      chatBytes: 9e9,
      sttTier: 'base',
      ttsBytes,
    });
    expect(fit.status).toBe('fits');
  });

  it('counts the given tier and names it on the fit', () => {
    const fit = voiceMemoryFit({
      memory: android(7.4e9),
      chatBytes: 1.4e9,
      sttTier: 'small',
      ttsBytes,
    });
    expect(fit.sttTier).toBe('small');
    expect(fit.breakdown.rows).toContainEqual({
      kind: 'stt',
      bytes: 650_000_000,
    });
  });

  it('names the tier on the early fits result too', () => {
    const fit = voiceMemoryFit({
      memory: null,
      chatBytes: 0,
      sttTier: 'large-turbo',
      ttsBytes,
    });
    expect(fit.sttTier).toBe('large-turbo');
  });

  it('fits when memory could not be read', () => {
    const fit = voiceMemoryFit({
      memory: null,
      chatBytes: 9e9,
      sttTier: 'base',
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
        sttTier: 'base',
        ttsBytes,
      });
      expect(fit.status === 'wont_fit').toBe(
        !whisperFits(memory, chatBytes, sttBytes),
      );
    },
  );
});
