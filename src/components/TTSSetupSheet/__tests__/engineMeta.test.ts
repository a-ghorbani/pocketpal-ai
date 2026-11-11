const MiB = 1024 * 1024;

// Pinned Hugging Face sizes: weights + tokenizer (3,497 B) + dict
// (3,556,124 B) + 30 voice files (522,240 B each).
const KOKORO_INSTALL_BYTES = {
  android: 92_361_116 + 3_497 + 3_556_124 + 30 * 522_240,
  ios: 325_532_232 + 3_497 + 3_556_124 + 30 * 522_240,
};

const loadOn = (os: 'ios' | 'android') => {
  let loaded!: {sizeMb: number; estimatedBytes: number};
  jest.isolateModules(() => {
    Object.defineProperty(require('react-native').Platform, 'OS', {
      configurable: true,
      get: () => os,
    });
    loaded = {
      sizeMb: require('../engineMeta').ENGINE_META.kokoro.sizeMb,
      estimatedBytes: require('../../../services/tts/constants')
        .KOKORO_MODEL_ESTIMATED_BYTES,
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
