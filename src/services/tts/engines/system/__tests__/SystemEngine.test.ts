import Speech from '@mhpdev/react-native-speech';

import {SystemEngine} from '..';
import type {Voice} from '../../../types';

// Test helpers exposed by the jest mock
import {
  __emitFinish,
  __finishListenerCount,
  __resetFinishListeners,
} from '../../../../../../__mocks__/external/@mhpdev/react-native-speech';

const VOICE: Voice = {
  id: 'com.apple.voice.Sarah',
  name: 'Sarah',
  engine: 'system',
  language: 'en-US',
};

const flush = () => new Promise(r => setImmediate(r));

describe('SystemEngine streaming', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetFinishListeners();
  });

  it('feeding 3 sentence fragments across appendText calls produces 3 sequential Speech.speak calls via onFinish chaining', async () => {
    const engine = new SystemEngine();
    const handle = engine.playStreaming(VOICE);

    // Split the 3 sentences across several chunks to simulate token streaming.
    handle.appendText('Hello world. How are ');
    handle.appendText('you today? ');
    handle.appendText('I am fine!');
    await flush();

    // First sentence was spoken immediately; others queued.
    expect(Speech.speak).toHaveBeenCalledTimes(1);
    expect(Speech.speak).toHaveBeenNthCalledWith(1, 'Hello world.', VOICE.id);

    // onFinish drives the next utterance
    __emitFinish();
    await flush();
    expect(Speech.speak).toHaveBeenCalledTimes(2);
    expect(Speech.speak).toHaveBeenNthCalledWith(
      2,
      'How are you today?',
      VOICE.id,
    );

    __emitFinish();
    await flush();
    expect(Speech.speak).toHaveBeenCalledTimes(3);
    expect(Speech.speak).toHaveBeenNthCalledWith(3, 'I am fine!', VOICE.id);
  });

  it('finalize() flushes a partial sentence with no terminal punctuation', async () => {
    const engine = new SystemEngine();
    const handle = engine.playStreaming(VOICE);

    handle.appendText('Hello, world');
    await flush();
    // No terminator — nothing spoken yet.
    expect(Speech.speak).not.toHaveBeenCalled();

    const p = handle.finalize();
    // After finalize, the tail is spoken.
    await flush();
    expect(Speech.speak).toHaveBeenCalledTimes(1);
    expect(Speech.speak).toHaveBeenCalledWith('Hello, world', VOICE.id);

    // finalize resolves after onFinish fires.
    __emitFinish();
    await expect(p).resolves.toBeUndefined();
  });

  it('cancel() clears the queue, calls Speech.stop, and makes subsequent appendText a no-op', async () => {
    const engine = new SystemEngine();
    const handle = engine.playStreaming(VOICE);

    handle.appendText('First. Second. Third.');
    await flush();
    // One speak started; two sentences queued.
    expect(Speech.speak).toHaveBeenCalledTimes(1);

    await handle.cancel();
    expect(Speech.stop).toHaveBeenCalledTimes(1);
    // onFinish subscription removed after cancel.
    expect(__finishListenerCount()).toBe(0);

    // Subsequent calls are no-ops.
    handle.appendText('Fourth.');
    await flush();
    expect(Speech.speak).toHaveBeenCalledTimes(1);
  });

  it('handles CJK sentence punctuation (。！？)', async () => {
    const engine = new SystemEngine();
    const handle = engine.playStreaming(VOICE);

    handle.appendText('你好。');
    await flush();
    expect(Speech.speak).toHaveBeenCalledWith('你好。', VOICE.id);
  });
});
