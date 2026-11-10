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

const startSpeech = (messageId: string) =>
  runInAction(() => {
    tts.voiceSpeechStarted = messageId;
  });

const setPlayback = (mode: 'idle' | 'streaming') =>
  runInAction(() => {
    tts.playbackState =
      mode === 'idle' ? {mode} : {mode, messageId: 'turn-1', handle: {}};
  });

describe('CascadeVoiceEngine', () => {
  const engine = new CascadeVoiceEngine();
  let savedSessions: unknown;

  beforeEach(async () => {
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
      tts.voiceSpeechStarted = null;
      tts.voiceStreamFailed = null;
      tts.autoSpeakEnabled = false;
      tts.deviceMeetsMemory = false;
      tts.userTTSOverride = null;
      tts.voiceOutputActive = false;
      tts.currentVoice = {id: 'F1', name: 'F1', engine: 'supertonic'};
      (asrStore as any).spokenLanguage = null;
    });
    await engine.prepare('base');
    jest.clearAllMocks();
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

    it('transcribes with resident base whisper without saving the detected language, sends, and speaks the answer', async () => {
      const port = makePort();
      const on = events();
      const turn = engine.runTurn(speech(500), port, on);
      await flush();

      expect(transcribe).toHaveBeenCalledWith(expect.any(String), {
        tier: 'base',
        language: undefined,
      });
      expect(asrStore.setSpokenLanguage).not.toHaveBeenCalled();
      expect(asrStore.spokenLanguage).toBeNull();
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
      startSpeech('turn-1');
      expect(on.speechStarted).toHaveBeenCalledTimes(1);

      port.settle();
      await flush();
      setPlayback('idle');

      await expect(turn.done).resolves.toBe('answered');
      expect(whisperRelease).not.toHaveBeenCalled();
    });

    it('passes the language the user already has', async () => {
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
    it('stops the speech and the run and leaves the reply as generated', async () => {
      const port = makePort();
      const turn = engine.runTurn(speech(500), port, events());
      await flush();
      createTurn(port);
      setPlayback('streaming');
      startSpeech('turn-1');

      const interrupting = turn.interrupt();
      expect(ttsStore.stop).toHaveBeenCalled();
      expect(port.stop).toHaveBeenCalled();

      setPlayback('idle');
      port.settle();
      await interrupting;

      await expect(turn.done).resolves.toBe('interrupted');
      expect(chatSessionStore.updateMessage).not.toHaveBeenCalled();
    });

    it('resolves only once the speech stream is cancelled', async () => {
      let cancelled!: () => void;
      (ttsStore.stop as jest.Mock).mockReturnValueOnce(
        new Promise<void>(resolve => {
          cancelled = resolve;
        }),
      );
      const port = makePort();
      const turn = engine.runTurn(speech(500), port, events());
      await flush();
      createTurn(port);
      setPlayback('streaming');

      let resolved = false;
      turn.interrupt().then(() => {
        resolved = true;
      });
      setPlayback('idle');
      port.settle();
      await flush();
      expect(resolved).toBe(false);

      cancelled();
      await flush();
      expect(resolved).toBe(true);
    });

    it('while transcribing cancels the decode and sends nothing', async () => {
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
    });

    it('ends the turn when it lands right as speech starts', async () => {
      const port = makePort();
      const on = events();
      on.speechStarted.mockImplementation(() => {
        turn.interrupt();
      });
      const turn = engine.runTurn(speech(500), port, on);
      await flush();
      createTurn(port);

      startSpeech('turn-1');
      port.settle();
      setPlayback('idle');

      await expect(turn.done).resolves.toBe('interrupted');
      expect(port.stop).toHaveBeenCalled();
    });

    it('after the turn finished does nothing', async () => {
      const port = makePort();
      const turn = engine.runTurn(speech(500), port, events());
      await flush();
      createTurn(port);
      startSpeech('turn-1');
      port.settle();
      await turn.done;

      await turn.interrupt();

      expect(port.stop).not.toHaveBeenCalled();
      expect(ttsStore.stop).not.toHaveBeenCalled();
    });

    it('in thinking, before anything was spoken, stops the run', async () => {
      const port = makePort();
      const turn = engine.runTurn(speech(500), port, events());
      await flush();
      createTurn(port);

      const interrupting = turn.interrupt();
      port.settle();
      await interrupting;

      expect(port.stop).toHaveBeenCalled();
      await expect(turn.done).resolves.toBe('interrupted');
      expect(chatSessionStore.updateMessage).not.toHaveBeenCalled();
    });
  });

  describe('residency', () => {
    it('prepare loads the given whisper tier and the voice engine', async () => {
      await engine.prepare('small');
      expect(preload).toHaveBeenCalledWith('small');
      expect(acquire).toHaveBeenCalledWith(
        expect.objectContaining({id: 'supertonic'}),
        expect.any(Function),
      );
    });

    it('logs how long each load took in dev builds, with no content', async () => {
      const log = jest.spyOn(console, 'log').mockImplementation(() => {});
      await engine.prepare('base');
      expect(log).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[voiceMode\] prepare: whisper \d+ ms, voice \d+ ms$/,
        ),
      );

      log.mockClear();
      (global as any).__DEV__ = false;
      await engine.prepare('base');
      (global as any).__DEV__ = true;
      expect(log).not.toHaveBeenCalled();
      log.mockRestore();
    });

    it('turns transcribe with the prepared tier', async () => {
      await engine.prepare('small');
      const port = makePort();
      const turn = engine.runTurn(speech(500), port, events());
      await flush();

      expect(transcribe).toHaveBeenCalledWith(expect.any(String), {
        tier: 'small',
        language: undefined,
      });
      createTurn(port);
      port.settle();
      await expect(turn.done).resolves.toBe('answered');
    });

    it('a turn after release fails to transcribe instead of guessing a tier', async () => {
      await engine.release();
      const turn = engine.runTurn(speech(500), makePort(), events());

      await expect(turn.done).resolves.toBe('transcribe_failed');
      expect(transcribe).not.toHaveBeenCalled();
    });

    it('release frees whisper and the voice engine when auto-speak is off', async () => {
      await engine.release();
      expect(whisperRelease).toHaveBeenCalledTimes(1);
      expect(ttsRelease).toHaveBeenCalledTimes(1);
    });

    it('release keeps the voice engine when chat auto-speak can use it', async () => {
      runInAction(() => {
        tts.autoSpeakEnabled = true;
        tts.deviceMeetsMemory = true;
      });
      await engine.release();
      expect(whisperRelease).toHaveBeenCalledTimes(1);
      expect(ttsRelease).not.toHaveBeenCalled();
    });

    it('release frees the voice engine when auto-speak is on but TTS is unavailable', async () => {
      runInAction(() => {
        tts.autoSpeakEnabled = true;
        tts.deviceMeetsMemory = false;
      });
      await engine.release();
      expect(ttsRelease).toHaveBeenCalledTimes(1);
    });
  });
});
