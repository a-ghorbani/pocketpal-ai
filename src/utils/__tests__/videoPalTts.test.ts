import {mockTTSStore} from '../../../__mocks__/stores/ttsStore';
import {VideoPalTtsSession} from '../videoPalTts';

const tts = mockTTSStore as any;

/**
 * Sentence-boundary buffering itself lives in the store's streaming handle
 * (see src/services/tts/streamingHandle.ts); the session's job is to feed
 * per-token deltas to that handle and flush at completion — never to
 * synthesize per-token.
 */
describe('VideoPalTtsSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens the stream on the first token and forwards every delta', () => {
    const session = new VideoPalTtsSession(true);
    session.onToken('The cat ');
    session.onToken('is on the mat. ');
    session.onToken('It is sleeping');

    expect(tts.onAssistantMessageStart).toHaveBeenCalledTimes(1);
    expect(tts.onAssistantMessageStart).toHaveBeenCalledWith(
      expect.stringMatching(/^videopal-/),
    );
    expect(tts.onAssistantMessageChunk).toHaveBeenCalledTimes(3);
    expect(tts.onAssistantMessageChunk).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/^videopal-/),
      'The cat ',
    );
    expect(tts.onAssistantMessageChunk).toHaveBeenNthCalledWith(
      3,
      expect.stringMatching(/^videopal-/),
      'It is sleeping',
    );
  });

  it('opens the stream exactly once per cycle', () => {
    const session = new VideoPalTtsSession(true);
    session.onToken('a');
    session.onToken('b');
    expect(tts.onAssistantMessageStart).toHaveBeenCalledTimes(1);
  });

  it('flushes the tail at completion with the accumulated deltas', () => {
    const session = new VideoPalTtsSession(true);
    session.onToken('First sentence. ');
    session.onToken('Tail without terminal punctuation');
    session.onComplete();

    expect(tts.onAssistantMessageComplete).toHaveBeenCalledWith(
      expect.stringMatching(/^videopal-/),
      'First sentence. Tail without terminal punctuation',
      {hadReasoning: false},
    );
  });

  it('prefers the engine-provided full text at completion', () => {
    const session = new VideoPalTtsSession(true);
    session.onToken('partial');
    session.onComplete('Full response text.');

    expect(tts.onAssistantMessageComplete).toHaveBeenCalledWith(
      expect.stringMatching(/^videopal-/),
      'Full response text.',
      {hadReasoning: false},
    );
  });

  it('does not speak anything when the Pal is muted', () => {
    const session = new VideoPalTtsSession(false);
    session.onToken('Hello');
    session.onComplete('Hello');
    session.onError();

    expect(tts.onAssistantMessageStart).not.toHaveBeenCalled();
    expect(tts.onAssistantMessageChunk).not.toHaveBeenCalled();
    expect(tts.onAssistantMessageComplete).not.toHaveBeenCalled();
    expect(tts.stop).not.toHaveBeenCalled();
  });

  it('ignores empty token deltas', () => {
    const session = new VideoPalTtsSession(true);
    session.onToken('');
    expect(tts.onAssistantMessageStart).not.toHaveBeenCalled();
    expect(tts.onAssistantMessageChunk).not.toHaveBeenCalled();
  });

  it('stops buffered audio on error once speech began', () => {
    const session = new VideoPalTtsSession(true);
    session.onToken('Some words.');
    session.onError();

    expect(tts.stop).toHaveBeenCalledWith('video_error');
  });

  it('does not stop on error before any speech began', () => {
    const session = new VideoPalTtsSession(true);
    session.onError();

    expect(tts.stop).not.toHaveBeenCalled();
  });

  it('gives each analysis cycle its own message id', () => {
    const first = new VideoPalTtsSession(true);
    const second = new VideoPalTtsSession(true);
    first.onToken('x');
    second.onToken('y');

    const firstId = tts.onAssistantMessageStart.mock.calls[0][0];
    const secondId = tts.onAssistantMessageStart.mock.calls[1][0];
    expect(firstId).not.toBe(secondId);
  });
  it('ignores late tokens and completion after cancellation before the first token', () => {
    const session = new VideoPalTtsSession(true);
    session.onError();
    session.onToken('Late reply.');
    session.onComplete('Late reply.');

    expect(tts.onAssistantMessageStart).not.toHaveBeenCalled();
    expect(tts.onAssistantMessageChunk).not.toHaveBeenCalled();
    expect(tts.onAssistantMessageComplete).not.toHaveBeenCalled();
  });

  it('does not reopen speech after cancellation during a reply', () => {
    const session = new VideoPalTtsSession(true);
    session.onToken('Partial');
    session.onError();
    jest.clearAllMocks();
    session.onToken(' late token');
    session.onComplete('Partial late token');

    expect(tts.onAssistantMessageChunk).not.toHaveBeenCalled();
    expect(tts.onAssistantMessageComplete).not.toHaveBeenCalled();
  });
  it('stops completion-only replay on cancellation too', () => {
    const session = new VideoPalTtsSession(true);
    session.onComplete('A reply delivered without token callbacks.');
    session.onError();

    expect(tts.stop).toHaveBeenCalledWith('video_error');
  });
});
