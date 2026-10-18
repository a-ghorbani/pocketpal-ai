import {runInAction} from 'mobx';

import {ASR_CHUNK_BYTES} from '../../asr/constants';
import {whisperAsrEngine} from '../../asr';
import {ttsRuntime} from '../../tts';
import {asrStore, chatSessionStore, ttsStore} from '../../../store';

import {CascadeVoiceEngine} from '../cascadeEngine';
import type {VoiceTurnEvents} from '../types';

const transcribe = jest.spyOn(whisperAsrEngine, 'transcribe');
const cancelTranscription = jest.spyOn(whisperAsrEngine, 'cancelTranscription');
const preload = jest.spyOn(whisperAsrEngine, 'preload');
const whisperRelease = jest.spyOn(whisperAsrEngine, 'release');
const acquire = jest.spyOn(ttsRuntime, 'acquire');
const ttsRelease = jest.spyOn(ttsRuntime, 'release');

const tts = ttsStore as any;
const chat = chatSessionStore as any;

const speech = (ms: number, amplitude = 0.1): Uint8Array => {
  const bytes = (ms / 50) * ASR_CHUNK_BYTES;
  const pcm = new Uint8Array(bytes);
  const view = new DataView(pcm.buffer);
  for (let i = 0; i < bytes / 2; i++) {
    view.setInt16(i * 2, (i % 2 ? 1 : -1) * amplitude * 0x7fff, true);
  }
  return pcm;
};

const flush = () => new Promise(resolve => setImmediate(resolve));

function makePort() {
  const port = {
    onTurn: null as ((id: string) => void) | null,
    settle: () => {},
    fail: (_: Error) => {},
    send: jest.fn(),
    stop: jest.fn(),
  };
  port.send.mockImplementation(
    (_text: string, onTurn: (id: string) => void) => {
      port.onTurn = onTurn;
      return new Promise<void>((resolve, reject) => {
        port.settle = resolve;
        port.fail = reject;
      });
    },
  );
  return port;
}

const events = (): jest.Mocked<VoiceTurnEvents> => ({
  transcribed: jest.fn(),
  speechStarted: jest.fn(),
});

const createTurn = (port: ReturnType<typeof makePort>, id = 'turn-1') => {
  chat.sessions = [
    {
      id: 'session-1',
      messages: [{id, type: 'assistant_turn', steps: [], metadata: {}}],
    },
  ];
  port.onTurn!(id);
};

const setSpoken = (messageId: string, text: string) =>
  runInAction(() => {
    tts.voiceSpoken = {messageId, text};
  });

const setPlayback = (mode: 'idle' | 'streaming') =>
  runInAction(() => {
    tts.playbackState =
      mode === 'idle' ? {mode} : {mode, messageId: 'turn-1', handle: {}};
  });

describe('CascadeVoiceEngine', () => {
  const engine = new CascadeVoiceEngine();
  let savedSessions: unknown;

  beforeEach(() => {
    savedSessions = chat.sessions;
    transcribe.mockResolvedValue({
      text: 'What is the capital of France?',
      language: 'en',
    });
    cancelTranscription.mockResolvedValue(undefined);
    preload.mockResolvedValue(undefined);
    whisperRelease.mockResolvedValue(undefined);
    acquire.mockImplementation(async (_engine, fn) => fn());
    ttsRelease.mockResolvedValue(undefined);
    setPlayback('idle');
    runInAction(() => {
      tts.voiceSpoken = null;
      tts.voiceStreamFailed = null;
      tts.autoSpeakEnabled = false;
      tts.currentVoice = {id: 'F1', name: 'F1', engine: 'supertonic'};
      (asrStore as any).spokenLanguage = null;
    });
  });

  afterEach(() => {
    chat.sessions = savedSessions;
  });

  describe('a turn', () => {
    it('sends nothing for audio the VAD rejects', async () => {
      const port = makePort();
      const turn = engine.runTurn(speech(500, 0.001), port, events());

      await expect(turn.done).resolves.toBe('empty');
      expect(transcribe).not.toHaveBeenCalled();
      expect(port.send).not.toHaveBeenCalled();
    });

    it('sends nothing for an empty transcript', async () => {
      transcribe.mockResolvedValueOnce({text: '  ', language: 'en'});
      const port = makePort();
      const turn = engine.runTurn(speech(500), port, events());

      await expect(turn.done).resolves.toBe('empty');
      expect(port.send).not.toHaveBeenCalled();
    });

    it('transcribes with resident base whisper, sends, and speaks the answer', async () => {
      const port = makePort();
      const on = events();
      const turn = engine.runTurn(speech(500), port, on);
      await flush();

      expect(transcribe).toHaveBeenCalledWith(expect.any(String), {
        tier: 'base',
        language: undefined,
      });
      expect(asrStore.setSpokenLanguage).toHaveBeenCalledWith('en');
      expect(on.transcribed).toHaveBeenCalledWith(
        'What is the capital of France?',
      );
      expect(port.send).toHaveBeenCalledWith(
        'What is the capital of France?',
        expect.any(Function),
      );

      createTurn(port);
      setPlayback('streaming');
      expect(on.speechStarted).not.toHaveBeenCalled();
      setSpoken('turn-1', 'Paris.');
      expect(on.speechStarted).toHaveBeenCalledTimes(1);

      port.settle();
      await flush();
      setPlayback('idle');

      await expect(turn.done).resolves.toBe('answered');
      expect(whisperRelease).not.toHaveBeenCalled();
    });

    it('passes the language already detected', async () => {
      runInAction(() => {
        (asrStore as any).spokenLanguage = 'fr';
      });
      const turn = engine.runTurn(speech(500), makePort(), events());
      await flush();

      expect(transcribe).toHaveBeenCalledWith(expect.any(String), {
        tier: 'base',
        language: 'fr',
      });
      expect(asrStore.setSpokenLanguage).not.toHaveBeenCalled();
      turn.interrupt();
    });

    it('fails a turn whose transcription throws', async () => {
      transcribe.mockRejectedValueOnce(new Error('decode'));
      jest.spyOn(console, 'warn').mockImplementationOnce(() => {});
      const turn = engine.runTurn(speech(500), makePort(), events());

      await expect(turn.done).resolves.toBe('transcribe_failed');
    });

    it('fails a turn whose run fails', async () => {
      jest.spyOn(console, 'warn').mockImplementationOnce(() => {});
      const port = makePort();
      const turn = engine.runTurn(speech(500), port, events());
      await flush();
      createTurn(port);
      port.fail(new Error('engine'));

      await expect(turn.done).resolves.toBe('reply_failed');
    });

    it('fails a turn whose row is gone or was cut short', async () => {
      const port = makePort();
      const turn = engine.runTurn(speech(500), port, events());
      await flush();
      createTurn(port);
      chat.sessions[0].messages[0].metadata = {interrupted: true};
      port.settle();

      await expect(turn.done).resolves.toBe('reply_failed');
    });

    it('reports speech that failed', async () => {
      const port = makePort();
      const turn = engine.runTurn(speech(500), port, events());
      await flush();
      createTurn(port);
      runInAction(() => {
        tts.voiceStreamFailed = 'turn-1';
      });
      port.settle();

      await expect(turn.done).resolves.toBe('speech_failed');
    });
  });

  describe('interrupt', () => {
    it('after the first chunk keeps only the spoken text', async () => {
      const port = makePort();
      const turn = engine.runTurn(speech(500), port, events());
      await flush();
      createTurn(port);
      setPlayback('streaming');
      setSpoken('turn-1', 'Paris is the capital.');

      const interrupting = turn.interrupt();
      expect(ttsStore.stop).toHaveBeenCalled();
      expect(port.stop).toHaveBeenCalled();
      expect(chatSessionStore.rewriteTurnToSpoken).not.toHaveBeenCalled();

      setPlayback('idle');
      port.settle();
      await interrupting;

      expect(chatSessionStore.rewriteTurnToSpoken).toHaveBeenCalledWith(
        'turn-1',
        'session-1',
        'Paris is the capital.',
      );
      await expect(turn.done).resolves.toBe('interrupted');
    });

    it('while transcribing cancels the decode and writes nothing', async () => {
      let finish!: (t: {text: string; language: string}) => void;
      transcribe.mockReturnValueOnce(
        new Promise(resolve => {
          finish = resolve;
        }),
      );
      const port = makePort();
      const turn = engine.runTurn(speech(500), port, events());
      await flush();

      const interrupting = turn.interrupt();
      expect(cancelTranscription).toHaveBeenCalledTimes(1);
      finish({text: '', language: ''});
      await interrupting;

      await expect(turn.done).resolves.toBe('interrupted');
      expect(port.send).not.toHaveBeenCalled();
      expect(chatSessionStore.rewriteTurnToSpoken).not.toHaveBeenCalled();
    });

    it('rewrites when it lands right after the first chunk starts, before speech is handled', async () => {
      const port = makePort();
      const on = events();
      on.speechStarted.mockImplementation(() => {
        turn.interrupt();
      });
      const turn = engine.runTurn(speech(500), port, on);
      await flush();
      createTurn(port);

      setSpoken('turn-1', 'Paris is the capital.');
      port.settle();
      setPlayback('idle');

      await expect(turn.done).resolves.toBe('interrupted');
      expect(chatSessionStore.rewriteTurnToSpoken).toHaveBeenCalledWith(
        'turn-1',
        'session-1',
        'Paris is the capital.',
      );
    });

    it('after the turn finished does nothing', async () => {
      const port = makePort();
      const turn = engine.runTurn(speech(500), port, events());
      await flush();
      createTurn(port);
      setSpoken('turn-1', 'Paris.');
      port.settle();
      await turn.done;

      await turn.interrupt();

      expect(port.stop).not.toHaveBeenCalled();
      expect(chatSessionStore.rewriteTurnToSpoken).not.toHaveBeenCalled();
    });

    it('does not rewrite from an earlier turn', async () => {
      setSpoken('turn-0', 'Old reply.');
      const port = makePort();
      const turn = engine.runTurn(speech(500), port, events());
      await flush();
      createTurn(port);

      const interrupting = turn.interrupt();
      port.settle();
      await interrupting;

      expect(chatSessionStore.rewriteTurnToSpoken).not.toHaveBeenCalled();
      await expect(turn.done).resolves.toBe('interrupted');
    });

    it('in thinking, before anything was spoken, stops the run and rewrites nothing', async () => {
      const port = makePort();
      const turn = engine.runTurn(speech(500), port, events());
      await flush();
      createTurn(port);

      const interrupting = turn.interrupt();
      port.settle();
      await interrupting;

      expect(port.stop).toHaveBeenCalled();
      expect(chatSessionStore.rewriteTurnToSpoken).not.toHaveBeenCalled();
    });
  });

  describe('residency', () => {
    it('prepare loads base whisper and the voice engine', async () => {
      await engine.prepare();
      expect(preload).toHaveBeenCalledWith('base');
      expect(acquire).toHaveBeenCalledWith(
        expect.objectContaining({id: 'supertonic'}),
        expect.any(Function),
      );
    });

    it('release frees whisper, and the voice engine only when auto-speak is off', async () => {
      await engine.release();
      expect(whisperRelease).toHaveBeenCalledTimes(1);
      expect(ttsRelease).toHaveBeenCalledTimes(1);

      runInAction(() => {
        tts.autoSpeakEnabled = true;
      });
      await engine.release();
      expect(ttsRelease).toHaveBeenCalledTimes(1);
    });
  });
});
