import {fromByteArray} from 'base64-js';
import {when} from 'mobx';

import {energyVad, int16PcmToFloat32, whisperAsrEngine} from '../asr';
import type {AsrTier, AsrTranscript} from '../asr';
import {getEngine, ttsRuntime} from '../tts';
import {asrStore, chatSessionStore, ttsStore} from '../../store';
import {vtrace} from '../../utils/voiceTrace';

import type {
  VoiceEngine,
  VoiceTurn,
  VoiceTurnEvents,
  VoiceTurnOutcome,
  VoiceTurnPort,
} from './types';

const findTurn = (turnId: string) => {
  for (const session of chatSessionStore.sessions) {
    const message = session.messages.find(m => m.id === turnId);
    if (message) {
      return {sessionId: session.id, message};
    }
  }
  return null;
};

/**
 * Whisper, then the chat model through the normal send path, then TTS.
 * The prepared Whisper tier and the voice's engine stay resident from
 * `prepare` to `release`.
 */
export class CascadeVoiceEngine implements VoiceEngine {
  readonly id = 'cascade';
  private tier: AsrTier | null = null;

  async prepare(tier: AsrTier): Promise<void> {
    this.tier = tier;
    const started = Date.now();
    await whisperAsrEngine.preload(tier);
    const whisperLoaded = Date.now();
    const voice = ttsStore.currentVoice;
    if (voice) {
      await ttsRuntime.acquire(getEngine(voice.engine), async () => {});
    }
    if (__DEV__) {
      console.log(
        `[voiceMode] prepare: whisper ${whisperLoaded - started} ms, voice ${
          Date.now() - whisperLoaded
        } ms`,
      );
    }
  }

  async release(): Promise<void> {
    this.tier = null;
    await whisperAsrEngine.release();
    if (!ttsStore.streamsReplies) {
      await ttsRuntime.release();
    }
  }

  runTurn(
    utterance: Uint8Array,
    port: VoiceTurnPort,
    on: VoiceTurnEvents,
  ): VoiceTurn {
    let aborted = false;
    let turnId: string | null = null;
    let sending: Promise<void> | null = null;
    let interrupting: Promise<void> | null = null;
    let finished = false;

    const interrupt = (): Promise<void> => {
      if (finished) {
        return Promise.resolve();
      }
      interrupting ??= (async () => {
        aborted = true;
        vtrace('turn.interrupt', {sending: !!sending, turnId});
        if (!sending) {
          await whisperAsrEngine.cancelTranscription().catch(err => {
            console.warn('[voiceMode] cancel transcription failed:', err);
          });
          return;
        }
        const stopping = ttsStore.stop('interrupt').catch(() => {});
        port.stop();
        await sending.catch(() => {});
        await stopping;
      })();
      return interrupting;
    };

    const run = async (): Promise<VoiceTurnOutcome> => {
      const vad = energyVad(int16PcmToFloat32(utterance));
      vtrace('vad', {
        passed: vad.passed,
        voicedMs: vad.voicedMs,
        ms: Math.round(vad.durationMs),
      });
      if (!vad.passed) {
        return 'empty';
      }
      let transcript: AsrTranscript;
      try {
        if (!this.tier) {
          throw new Error('voice engine not prepared');
        }
        transcript = await whisperAsrEngine.transcribe(
          fromByteArray(utterance),
          {tier: this.tier, language: asrStore.spokenLanguage ?? undefined},
        );
      } catch (err) {
        if (aborted) {
          return 'interrupted';
        }
        console.warn('[voiceMode] transcribe failed:', err);
        return 'transcribe_failed';
      }
      if (aborted) {
        return 'interrupted';
      }
      const text = transcript.text.trim();
      vtrace('asr', {chars: text.length, rawChars: transcript.text.length});
      if (!text) {
        return 'empty';
      }
      on.transcribed(text);
      const stopWatching = when(
        () => {
          const startedId = ttsStore.voiceSpeechStarted;
          return startedId !== null && startedId === turnId;
        },
        () => on.speechStarted(),
      );
      sending = port.send(text, id => {
        turnId = id;
      });
      let sendFailed = false;
      try {
        await sending;
      } catch (err) {
        console.warn('[voiceMode] reply failed:', err);
        sendFailed = true;
      }
      vtrace('turn.sent', {turnId, failed: sendFailed});
      await when(() => ttsStore.playbackState.mode === 'idle');
      vtrace('turn.idle');
      stopWatching();

      if (interrupting) {
        await interrupting;
        return 'interrupted';
      }
      const turn = turnId ? findTurn(turnId) : null;
      if (sendFailed || !turn || turn.message.metadata?.interrupted) {
        return 'reply_failed';
      }
      if (ttsStore.voiceStreamFailed === turnId) {
        return 'speech_failed';
      }
      return 'answered';
    };
    const done = run().finally(() => {
      finished = true;
    });

    return {done, interrupt};
  }
}
