/**
 * Jest mock for `@pocketpalai/react-native-speech`.
 *
 * The real package ships untranspiled source + TurboModule bindings, neither
 * of which Jest can load. We expose the subset that `SystemEngine` uses,
 * including the `onFinish` event emitter used by `playStreaming` to chain
 * sentence-level utterances.
 */

type FinishListener = (event: {utteranceId?: string}) => void;
const finishListeners = new Set<FinishListener>();

const onFinish = jest.fn((listener: FinishListener) => {
  finishListeners.add(listener);
  return {
    remove: jest.fn(() => {
      finishListeners.delete(listener);
    }),
  };
});

/**
 * Test helper: emit an `onFinish` event to all registered listeners.
 * Exported so tests can drive the streaming chain without a real native
 * module.
 */
export const __emitFinish = (utteranceId?: string) => {
  for (const l of Array.from(finishListeners)) {
    l({utteranceId});
  }
};

/** Test helper: number of currently-registered onFinish listeners. */
export const __finishListenerCount = () => finishListeners.size;

/** Test helper: clear listeners between tests. */
export const __resetFinishListeners = () => {
  finishListeners.clear();
};

const Speech = {
  initialize: jest.fn().mockResolvedValue(undefined),
  speak: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  release: jest.fn().mockResolvedValue(undefined),
  getAvailableVoices: jest.fn().mockResolvedValue([
    {
      identifier: 'com.apple.voice.Sarah',
      name: 'Sarah',
      language: 'en-US',
      quality: 0,
    },
  ]),
  onFinish,
};

export default Speech;

/** Mirror of the fork's `TTSEngine` enum — minimum surface used by tests. */
export enum TTSEngine {
  OS_NATIVE = 'os-native',
  KOKORO = 'kokoro',
  SUPERTONIC = 'supertonic',
  POCKET = 'pocket',
  KITTEN = 'kitten',
}
