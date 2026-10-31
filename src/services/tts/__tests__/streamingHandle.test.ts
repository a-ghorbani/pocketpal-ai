import Speech from '@pocketpalai/react-native-speech';
import {waitFor} from '@testing-library/react-native';

import {
  __getCreatedStreams,
  __resetCreatedStreams,
} from '../../../../__mocks__/external/@pocketpalai/react-native-speech';

import {ttsRuntime} from '../runtime';
import {createEngineStreamingHandle} from '../streamingHandle';
import type {Engine} from '../types';

const engine = {
  id: 'kokoro',
  loadInto: jest.fn().mockResolvedValue(undefined),
} as unknown as Engine;

describe('createEngineStreamingHandle', () => {
  beforeEach(() => {
    __resetCreatedStreams();
    ttsRuntime._resetForTests();
  });

  it('passes stream options to the library and subscribes progress once', async () => {
    const onProgress = jest.fn();

    createEngineStreamingHandle(engine, 'voice-1', {
      firstChunk: 'clause',
      stripMarkdown: false,
      onProgress,
    });

    await waitFor(() => expect(__getCreatedStreams()).toHaveLength(1));
    expect(Speech.createSpeechStream).toHaveBeenCalledWith('voice-1', {
      targetChars: 300,
      firstChunk: 'clause',
      stripMarkdown: false,
    });
    const [stream] = __getCreatedStreams();
    expect(stream!.onProgress).toHaveBeenCalledTimes(1);
    expect(stream!.onProgress).toHaveBeenCalledWith(onProgress);
  });

  it('subscribes nothing without a progress listener', async () => {
    createEngineStreamingHandle(engine, 'voice-1');

    await waitFor(() => expect(__getCreatedStreams()).toHaveLength(1));
    expect(__getCreatedStreams()[0]!.onProgress).not.toHaveBeenCalled();
  });

  it('creates no stream when cancelled while waiting', async () => {
    let release!: () => void;
    const handle = createEngineStreamingHandle(
      engine,
      'voice-1',
      {onProgress: jest.fn()},
      new Promise<void>(resolve => {
        release = resolve;
      }),
    );

    await handle.cancel();
    release();
    await new Promise(resolve => setImmediate(resolve));

    expect(__getCreatedStreams()).toHaveLength(0);
  });
});
