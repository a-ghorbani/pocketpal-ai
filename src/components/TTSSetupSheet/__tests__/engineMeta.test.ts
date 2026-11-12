const MiB = 1024 * 1024;

// Pinned Hugging Face sizes: weights + tokenizer (3,497 B) + dict
// (3,556,124 B) + 30 voice files (522,240 B each).
const KOKORO_INSTALL_BYTES = {
  android: 92_361_116 + 3_497 + 3_556_124 + 30 * 522_240,
  ios: 325_532_232 + 3_497 + 3_556_124 + 30 * 522_240,
};

// Peak delta PSS of the int8 model on an Android phone (tts-memory-profile).
const KOKORO_INT8_PEAK_BYTES = 291.08 * MiB;

const loadOn = (os: 'ios' | 'android') => {
  let loaded!: {
    sizeMb: number;
    ramMb: number;
    estimatedBytes: number;
    runtimeBytes: number;
  };
  jest.isolateModules(() => {
    Object.defineProperty(require('react-native').Platform, 'OS', {
      configurable: true,
      get: () => os,
    });
    const {ENGINE_META} = require('../engineMeta');
    const constants = require('../../../services/tts/constants');
    loaded = {
      sizeMb: ENGINE_META.kokoro.sizeMb,
      ramMb: ENGINE_META.kokoro.ramMb,
      estimatedBytes: constants.KOKORO_MODEL_ESTIMATED_BYTES,
      runtimeBytes: constants.TTS_ENGINE_RUNTIME_BYTES.kokoro,
    };
  });
  return loaded;
};

describe('Kokoro size per platform', () => {
  it.each(['android', 'ios'] as const)(
    '%s: the estimate is the install size and the label shows it',
    os => {
      const {sizeMb, estimatedBytes} = loadOn(os);

      expect(estimatedBytes).toBeGreaterThanOrEqual(KOKORO_INSTALL_BYTES[os]);
      expect(estimatedBytes - KOKORO_INSTALL_BYTES[os]).toBeLessThan(2 * MiB);
      expect(sizeMb * MiB).toBe(estimatedBytes);
    },
  );
});

describe('Kokoro RAM per platform', () => {
  it('Android counts the measured int8 peak, below the FP32 figures', () => {
    const {ramMb, runtimeBytes} = loadOn('android');

    expect(runtimeBytes).toBeGreaterThanOrEqual(KOKORO_INT8_PEAK_BYTES);
    expect(runtimeBytes).toBeLessThan(500_000_000);
    expect(ramMb * 1e6).toBeGreaterThanOrEqual(KOKORO_INT8_PEAK_BYTES);
    expect(ramMb).toBeLessThan(640);
  });

  it('iOS keeps the FP32 figures', () => {
    const {ramMb, runtimeBytes} = loadOn('ios');

    expect(runtimeBytes).toBe(500_000_000);
    expect(ramMb).toBe(640);
  });
});

describe('Voice count label', () => {
  it('matches the Kokoro catalog', () => {
    const {ENGINE_META} = require('../engineMeta');
    const {
      KOKORO_VOICES,
    } = require('../../../services/tts/engines/kokoro/voices');

    expect(ENGINE_META.kokoro.voices).toBe(KOKORO_VOICES.length);
  });
});
