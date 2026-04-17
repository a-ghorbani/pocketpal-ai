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

describe('SystemEngine streaming', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCreatedStreams();
    __resetFinishListeners();
    ttsRuntime._resetForTests();
  });

  it('playStreaming creates a lib stream with the voice id and targetChars=300', () => {
    new SystemEngine().playStreaming(VOICE);

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
    const [stream] = __getCreatedStreams();

    handle.appendText('Hi.');
    await handle.finalize();

    expect(stream!.finalize).toHaveBeenCalledTimes(1);
  });

  it('cancel forwards to the lib stream and blocks further appends', async () => {
    const handle = new SystemEngine().playStreaming(VOICE);
    const [stream] = __getCreatedStreams();

    await handle.cancel();
    expect(stream!.cancel).toHaveBeenCalledTimes(1);

    handle.appendText('Too late.');
    await flush();
    expect(stream!.append).not.toHaveBeenCalled();
  });

  it('cancel before acquire completes drops pending appends', async () => {
    const handle = new SystemEngine().playStreaming(VOICE);
    const [stream] = __getCreatedStreams();

    handle.appendText('Buffered before engine is ready');
    await handle.cancel();
    await flush();

    expect(stream!.cancel).toHaveBeenCalledTimes(1);
    expect(stream!.append).not.toHaveBeenCalled();
  });

  it('cancel() is safe with no prior appends', async () => {
    const handle = new SystemEngine().playStreaming(VOICE);
    await expect(handle.cancel()).resolves.toBeUndefined();
  });
});
