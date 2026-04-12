/**
 * TTS service types.
 *
 * Voices and engines are abstracted over `@mhpdev/react-native-speech` so the
 * rest of the app doesn't touch that package directly.
 */

export type EngineId = 'system' | 'supertonic';

export interface Voice {
  /** Stable identifier used to look up the voice on the underlying engine. */
  id: string;
  /** Human-readable display name (e.g., "Sarah"). */
  name: string;
  /** Engine that owns this voice. */
  engine: EngineId;
  /** Optional language code (BCP-47 or engine-specific). */
  language?: string;
  /** Optional gender hint for UI grouping. */
  gender?: 'f' | 'm';
}

export interface SpeakOptions {
  /** Explicit voice to use; falls back to the store's `currentVoice` otherwise. */
  voice?: Voice;
}

export interface Engine {
  readonly id: EngineId;
  /** Returns whether the engine is ready to play (models installed, etc). */
  isInstalled(): Promise<boolean>;
  /** List available voices for this engine. */
  getVoices(): Promise<Voice[]>;
  /** Speak `text` using `voice`. Rejects on failure. */
  play(text: string, voice: Voice): Promise<void>;
  /** Stop any in-flight playback. Safe to call when idle. */
  stop(): Promise<void>;
}
