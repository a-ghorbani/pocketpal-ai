import {ASR_IOS_CEILING_SHARE, ASR_TIERS} from '../../asr/constants';
import {
  asrMemoryStatus,
  memoryBudget,
  type DeviceMemory,
} from '../../asr/whisperFits';
import {TTS_ENGINE_RUNTIME_BYTES} from '../../tts/constants';
import {formatBytes} from '../../../utils/formatters';
import {voiceMemoryFit} from '../memoryFit';

const sttBytes = ASR_TIERS.base.runtimeBytes;
const ttsBytes = TTS_ENGINE_RUNTIME_BYTES.supertonic;
const android = (totalBytes: number) => ({os: 'android' as const, totalBytes});
const ios = (ceilingBytes: number, totalBytes = 6e9) => ({
  os: 'ios' as const,
  ceilingBytes,
  totalBytes,
});

describe('voiceMemoryFit', () => {
  it('is tight for a 3.23 GB chat model on a 7.4 GB Android phone', () => {
    const fit = voiceMemoryFit({
      memory: android(7.4e9),
      chatBytes: 3.23e9,
      sttTier: 'base',
      ttsBytes: TTS_ENGINE_RUNTIME_BYTES.kitten,
    });
    expect(fit.status).toBe('tight');
  });

  it('is tight for an 8 GB chat model with Small and a voice on a 16 GB phone', () => {
    const fit = voiceMemoryFit({
      memory: android(15.8e9),
      chatBytes: 8e9,
      sttTier: 'small',
      ttsBytes: 0.5e9,
    });
    expect(fit.status).toBe('tight');
  });

  it.each([
    ['8 GB', 8e9, '8.5 GB'],
    ['9.5 GB', 9.5e9, '10 GB'],
  ])(
    'is tight for a %s chat model with Base and Phonon on a 12 GB phone',
    (_name, chatBytes, needed) => {
      const fit = voiceMemoryFit({
        memory: android(12.2e9),
        chatBytes,
        sttTier: 'base',
        ttsBytes: TTS_ENGINE_RUNTIME_BYTES.phonon,
      });
      expect(fit.status).toBe('tight');
      expect(formatBytes(fit.breakdown.neededBytes, 1)).toBe(needed);
      expect(formatBytes(fit.breakdown.availableBytes, 1)).toBe('5.5 GB');
    },
  );

  it("won't fit when the models pass total RAM", () => {
    const fit = voiceMemoryFit({
      memory: android(7.4e9),
      chatBytes: 7.2e9,
      sttTier: 'base',
      ttsBytes: TTS_ENGINE_RUNTIME_BYTES.kitten,
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

  it("on iOS won't fit only above total RAM", () => {
    const at = (chatBytes: number) =>
      voiceMemoryFit({
        memory: ios(4e9, 6e9),
        chatBytes,
        sttTier: 'base',
        ttsBytes,
      }).status;
    expect(at(4e9 * ASR_IOS_CEILING_SHARE - sttBytes + 1)).toBe('tight');
    expect(at(6e9 - sttBytes - ttsBytes)).toBe('tight');
    expect(at(6e9 - sttBytes - ttsBytes + 1)).toBe('wont_fit');
  });

  it.each([
    ['1.7B', 1.9e9, 'fits'],
    ['4B Q4', 3.2e9, 'tight'],
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
    'status is the ASR status of the summed rows (%o, %d)',
    (memory, chatBytes) => {
      const fit = voiceMemoryFit({
        memory,
        chatBytes,
        sttTier: 'base',
        ttsBytes,
      });
      expect(fit.status).toBe(
        asrMemoryStatus(memory, chatBytes + sttBytes + ttsBytes),
      );
    },
  );

  const memories: DeviceMemory[] = [
    android(4e9),
    android(7.4e9),
    android(15.8e9),
    ios(0),
    ios(4.2e9),
    ios(4.2e9, Infinity),
  ];
  const grid = memories.flatMap(memory =>
    [0, 1.36e9, 3.23e9, 8e9].flatMap(chatBytes =>
      (['base', 'small'] as const).flatMap(sttTier =>
        [
          TTS_ENGINE_RUNTIME_BYTES.kitten,
          TTS_ENGINE_RUNTIME_BYTES.supertonic,
        ].map(tts => [memory, chatBytes, sttTier, tts] as const),
      ),
    ),
  );

  it.each(grid)(
    'fits exactly when the rows fit the budget (%o, chat %d, %s, voice %d)',
    (memory, chatBytes, sttTier, tts) => {
      const fit = voiceMemoryFit({memory, chatBytes, sttTier, ttsBytes: tts});
      const needed = chatBytes + ASR_TIERS[sttTier].runtimeBytes + tts;
      expect(fit.status === 'fits').toBe(
        (memory.os === 'ios' && memory.ceilingBytes === 0) ||
          needed <= memoryBudget(memory),
      );
    },
  );
});
