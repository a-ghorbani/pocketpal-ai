import {NativeNeuralAudioPlayer} from '@pocketpalai/react-native-speech/lib/module/NativeAudioPlayer.js';

import {onAudioInterruption} from '../audioInterruptions';

jest.unmock('../audioInterruptions');

jest.mock(
  '@pocketpalai/react-native-speech/lib/module/NativeAudioPlayer.js',
  () => ({
    NativeNeuralAudioPlayer: {
      onAudioInterruption: jest.fn(() => ({remove: jest.fn()})),
    },
  }),
);

describe('onAudioInterruption', () => {
  it("subscribes to the speech library's interruption event", () => {
    const listener = jest.fn();

    const subscription = onAudioInterruption(listener);

    expect(NativeNeuralAudioPlayer.onAudioInterruption).toHaveBeenCalledWith(
      listener,
    );
    expect(subscription.remove).toEqual(expect.any(Function));
  });
});
