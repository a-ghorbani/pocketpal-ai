/**
 * Jest mock for `@mhpdev/react-native-speech`.
 *
 * The real package ships untranspiled source + TurboModule bindings, neither
 * of which Jest can load. We expose the subset that `SystemEngine` uses.
 */
const Speech = {
  speak: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  getAvailableVoices: jest.fn().mockResolvedValue([
    {
      identifier: 'com.apple.voice.Sarah',
      name: 'Sarah',
      language: 'en-US',
      quality: 0,
    },
  ]),
};

export default Speech;
