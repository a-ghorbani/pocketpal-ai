import {fromByteArray} from 'base64-js';
import {when} from 'mobx';

import {energyVad, int16PcmToFloat32, whisperAsrEngine} from '../asr';
import type {AsrTranscript} from '../asr';
import {getEngine, ttsRuntime} from '../tts';
import {asrStore, chatSessionStore, ttsStore} from '../../store';

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
 * Whisper `base` and the voice's engine stay resident from `prepare` to
 * `release`.
 */
export class CascadeVoiceEngine implements VoiceEngine {
  readonly id = 'cascade';

  async prepare(): Promise<void> {
    await whisperAsrEngine.preload('base');
    const voice = ttsStore.currentVoice;
    if (voice) {
      await ttsRuntime.acquire(getEngine(voice.engine), async () => {});
    }
  }

  async release(): Promise<void> {
    await whisperAsrEngine.release();
    if (!ttsStore.autoSpeakEnabled) {
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

    const heardText = () => {
      const spoken = ttsStore.voiceSpoken;
      return spoken?.messageId === turnId ? spoken.text : '';
    };

    const markUnheard = async () => {
      const turn = turnId ? findTurn(turnId) : null;
      if (turn && !heardText()) {
        await chatSessionStore.updateMessage(turn.message.id, turn.sessionId, {
          metadata: {spoken: false},
        });
      }
    };

    const keepOnlySpoken = async () => {
      const turn = turnId ? findTurn(turnId) : null;
      const text = heardText();
      if (turn && text) {
        await chatSessionStore.rewriteTurnToSpoken(
          turn.message.id,
          turn.sessionId,
          text,
        );
      } else {
        await markUnheard();
      }
    };

    const interrupt = (): Promise<void> => {
      if (finished) {
        return Promise.resolve();
      }
      interrupting ??= (async () => {
        aborted = true;
        if (!sending) {
          await whisperAsrEngine.cancelTranscription().catch(err => {
            console.warn('[voiceMode] cancel transcription failed:', err);
          });
          return;
        }
        ttsStore.stop().catch(() => {});
        port.stop();
        await sending.catch(() => {});
        await keepOnlySpoken();
      })();
      return interrupting;
    };

    const run = async (): Promise<VoiceTurnOutcome> => {
      if (!energyVad(int16PcmToFloat32(utterance)).passed) {
        return 'empty';
      }
      let transcript: AsrTranscript;
      try {
        transcript = await whisperAsrEngine.transcribe(
          fromByteArray(utterance),
          {tier: 'base', language: asrStore.spokenLanguage ?? undefined},
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
      if (!text) {
        return 'empty';
      }
      if (!asrStore.spokenLanguage && transcript.language) {
        asrStore.setSpokenLanguage(transcript.language);
      }

      on.transcribed(text);
      const stopWatching = when(
        () => {
          const spokenId = ttsStore.voiceSpoken?.messageId;
          return spokenId !== undefined && spokenId === turnId;
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
      await when(() => ttsStore.playbackState.mode === 'idle');
      stopWatching();

      if (interrupting) {
        await interrupting;
        return 'interrupted';
      }
      await markUnheard();
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
