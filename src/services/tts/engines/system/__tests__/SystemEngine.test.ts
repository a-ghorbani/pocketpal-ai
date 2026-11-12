import Speech from '@pocketpalai/react-native-speech';

import {SystemEngine} from '..';
import {ttsRuntime} from '../../../runtime';
import type {Voice} from '../../../types';

import {
  __getCreatedStreams,
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

const deferredStream = () => {
  let settle: {resolve: () => void; reject: (e: Error) => void} = {
    resolve: () => {},
    reject: () => {},
  };
  const stream = {
    append: jest.fn(),
    finalize: jest.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          settle = {resolve, reject};
        }),
    ),
    cancel: jest.fn().mockResolvedValue(undefined),
    onProgress: jest.fn(() => jest.fn()),
  };
  (Speech.createSpeechStream as jest.Mock).mockImplementationOnce(() => stream);
  return {stream, settle: () => settle};
};

describe('SystemEngine.play', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCreatedStreams();
    ttsRuntime._resetForTests();
  });

  it('speaks with the saved id as is, even one the phone no longer lists', async () => {
    (Speech.getAvailableVoices as jest.Mock).mockResolvedValueOnce([]);

    await new SystemEngine().play('hello', {
      id: 'en-us-x-gone-local',
      name: 'Voice 3 · gone',
      engine: 'system',
      language: 'en-US',
    });

    expect(Speech.createSpeechStream).toHaveBeenCalledWith(
      'en-us-x-gone-local',
      expect.anything(),
    );
    expect(Speech.getAvailableVoices).not.toHaveBeenCalled();
  });

  it('appends the whole text once to a one-shot stream, never Speech.speak', async () => {
    await new SystemEngine().play('One. Two. Three.', VOICE);

    const [stream] = __getCreatedStreams();
    expect(stream!.append).toHaveBeenCalledTimes(1);
    expect(stream!.append).toHaveBeenCalledWith('One. Two. Three.');
    expect(stream!.finalize).toHaveBeenCalledTimes(1);
    expect(Speech.speak).not.toHaveBeenCalled();
  });

  it('resolves only when the stream finalize resolves (end of audio)', async () => {
    const {stream, settle} = deferredStream();
    let done = false;
    const playing = new SystemEngine().play('Hi.', VOICE).then(() => {
      done = true;
    });
    await flush();

    expect(stream.finalize).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);

    settle().resolve();
    await playing;
    expect(done).toBe(true);
  });

  it('rejects when the stream finalize rejects', async () => {
    const {settle} = deferredStream();
    const playing = new SystemEngine().play('Hi.', VOICE);
    await flush();

    settle().reject(new Error('queue failed'));
    await expect(playing).rejects.toThrow('queue failed');
  });
});

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
    const handle = new SystemEngine().playStreaming(VOICE);

    handle.appendText('Hi.');
    await handle.finalize();

    const [stream] = __getCreatedStreams();
    expect(stream!.finalize).toHaveBeenCalledTimes(1);
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

  it('playStreaming forwards stream options to the lib stream', async () => {
    const onProgress = jest.fn();
    new SystemEngine().playStreaming(VOICE, undefined, {
      firstChunk: 'clause',
      onProgress,
    });
    await flush();

    expect(Speech.createSpeechStream).toHaveBeenCalledWith(
      VOICE.id,
      expect.objectContaining({targetChars: 300, firstChunk: 'clause'}),
    );
    const [stream] = __getCreatedStreams();
    expect(stream!.onProgress).toHaveBeenCalledWith(onProgress);
  });
});
