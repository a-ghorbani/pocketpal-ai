import type {AsrTier} from '../asr';

/** How one voice turn ended. Failures name the stage that failed. */
export type VoiceTurnOutcome =
  | 'empty'
  | 'answered'
  | 'interrupted'
  | 'transcribe_failed'
  | 'reply_failed'
  | 'speech_failed';

/** The chat the voice session talks to, backed by `useChatSession`. */
export interface VoiceTurnPort {
  /**
   * Sends `text` as a spoken chat turn. `onTurnCreated` receives the
   * assistant turn's id once its row exists; the promise resolves when the
   * run settles.
   */
  send(text: string, onTurnCreated: (turnId: string) => void): Promise<void>;
  /** Stops the running reply, as the Stop button does. */
  stop(): void;
}

export interface VoiceTurnEvents {
  transcribed(text: string): void;
  speechStarted(): void;
}

export interface VoiceTurn {
  done: Promise<VoiceTurnOutcome>;
  /** Stops the speech and the run; the reply keeps what was generated. */
  interrupt(): Promise<void>;
}

/**
 * Turns one utterance into a spoken reply. The cascade (whisper, chat
 * model, TTS) is the only engine. Its readiness and memory checks live in
 * the session controller, so another engine would need those moved here.
 */
export interface VoiceEngine {
  readonly id: 'cascade';
  /** Makes the speech models resident for the session; turns use `tier`. */
  prepare(tier: AsrTier): Promise<void>;
  /** Frees them; resolves once any in-flight decode has stopped. */
  release(): Promise<void>;
  runTurn(
    utterance: Uint8Array,
    port: VoiceTurnPort,
    on: VoiceTurnEvents,
  ): VoiceTurn;
}
