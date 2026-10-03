import Speech from '@pocketpalai/react-native-speech';

import {SystemEngine} from '..';
import {ttsRuntime} from '../../../runtime';
import type {Voice} from '../../../types';

import {
  __getCreatedStreams,
  __emitError,
  __emitFinish,
  __finishListenerCount,
  __resetCreatedStreams,
  __resetFinishListeners,
} from '../../../../../../__mocks__/external/@pocketpalai/react-native-speech';

const VOICE: Voice = {
  id: 'com.apple.voice.Sarah',
  name: 'Sarah',
  engine: 'system',
  language: 'en-US',
};

const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setImmediate(r));
  }
};

describe('SystemEngine streaming', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCreatedStreams();
    __resetFinishListeners();
    ttsRuntime._resetForTests();
  });

  it('playStreaming creates a lib stream with the voice id and targetChars=300', async () => {
    new SystemEngine().playStreaming(VOICE);
    await flush();

    expect(Speech.createSpeechStream).toHaveBeenCalledTimes(1);
    expect(Speech.createSpeechStream).toHaveBeenCalledWith(
      VOICE.id,
      expect.objectContaining({targetChars: 300}),
    );
  });

  it('forwards appendText to the lib stream after the engine is acquired', async () => {
    const handle = new SystemEngine().playStreaming(VOICE);

    handle.appendText('Hello world. ');
    handle.appendText('How are you?');
    await flush();

    const [stream] = __getCreatedStreams();
    expect(stream!.append).toHaveBeenCalledTimes(2);
    expect(stream!.append).toHaveBeenNthCalledWith(1, 'Hello world. ');
    expect(stream!.append).toHaveBeenNthCalledWith(2, 'How are you?');
  });

  it('appends arriving after acquire go straight to the stream', async () => {
    const handle = new SystemEngine().playStreaming(VOICE);
    await flush();

    handle.appendText('Later.');
    const [stream] = __getCreatedStreams();
    expect(stream!.append).toHaveBeenCalledWith('Later.');
  });

  it('finalize forwards to the lib stream', async () => {
    (Speech.isSpeaking as jest.Mock)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    const handle = new SystemEngine().playStreaming(VOICE);

    handle.appendText('Hi.');
    await handle.finalize();

    const [stream] = __getCreatedStreams();
    expect(stream!.finalize).toHaveBeenCalledTimes(1);
    expect(Speech.isSpeaking).toHaveBeenCalledTimes(3);
    expect(__finishListenerCount()).toBe(0);
  });

  it('accepts a short utterance that finishes before the first speaking poll', async () => {
    const engine = new SystemEngine();
    (Speech.speak as jest.Mock).mockImplementationOnce(async () => {
      __emitFinish();
    });
    (Speech.isSpeaking as jest.Mock).mockResolvedValue(false);

    await engine.play('Hi', VOICE);

    expect(__finishListenerCount()).toBe(0);
  });

  it('rejects a system speech error rather than treating idle as completed', async () => {
    const engine = new SystemEngine();
    (Speech.speak as jest.Mock).mockImplementationOnce(async () => {
      __emitError();
    });
    await expect(engine.play('Hi', VOICE)).rejects.toThrow(
      'System speech playback failed',
    );
    expect(__finishListenerCount()).toBe(0);
  });

  it('does not mistake cancellation for natural completion', async () => {
    (Speech.isSpeaking as jest.Mock).mockResolvedValue(true);
    const handle = new SystemEngine().playStreaming(VOICE);
    await flush();
    const finalize = handle.finalize();
    await handle.cancel();
    await finalize;
    expect(__finishListenerCount()).toBe(0);
  });

  it('cancel forwards to the lib stream and blocks further appends', async () => {
    const handle = new SystemEngine().playStreaming(VOICE);
    await flush();

    const [stream] = __getCreatedStreams();
    await handle.cancel();
    expect(stream!.cancel).toHaveBeenCalledTimes(1);

    handle.appendText('Too late.');
    await flush();
    expect(stream!.append).not.toHaveBeenCalled();
  });

  it('cancel before acquire completes drops pending appends', async () => {
    const handle = new SystemEngine().playStreaming(VOICE);

    handle.appendText('Buffered before engine is ready');
    await handle.cancel();
    await flush();

    // Stream was never created because cancel() fired before acquire
    const streams = __getCreatedStreams();
    expect(streams).toHaveLength(0);
  });

  it('cancel() is safe with no prior appends', async () => {
    const handle = new SystemEngine().playStreaming(VOICE);
    await expect(handle.cancel()).resolves.toBeUndefined();
  });
});
