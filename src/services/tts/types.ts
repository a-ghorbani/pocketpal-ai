/**
 * TTS service types.
 *
 * Voices and engines are abstracted over `@pocketpalai/react-native-speech` so the
 * rest of the app doesn't touch that package directly.
 */

export type EngineId = 'kitten' | 'kokoro' | 'supertonic' | 'system';

/**
 * Discrete set of diffusion-step counts exposed in the Supertonic UI.
 * The fork supports `1|2|3|4|5|10|20|50`; PocketPal exposes
 * `1|2|3|5|10|20`. We skip 4 (perceptually too close to 3/5) and 50
 * (latency budget too high for interactive use).
 */
export type SupertonicSteps = 1 | 2 | 3 | 5 | 10 | 20;

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

/**
 * A per-message streaming playback session. Returned by
 * `Engine.playStreaming`. The store feeds tokens in via `appendText` as the
 * LLM produces them, calls `finalize` when the response is complete, or
 * `cancel` to tear down on stop / chat switch / background.
 *
 * Implementations must be idempotent: after `finalize` or `cancel`, further
 * calls are no-ops (or the returned promise resolves immediately).
 */
export interface StreamingHandle {
  /** Append a text chunk (delta) from the LLM to the streaming buffer. */
  appendText(chunk: string): void;
  /** Flush remaining buffered text and resolve when playback drains. */
  finalize(): Promise<void>;
  /** Stop playback and discard any remaining buffered text. */
  cancel(): Promise<void>;
}

export interface Engine {
  readonly id: EngineId;
  /** Returns whether the engine is ready to play (models installed, etc). */
  isInstalled(): Promise<boolean>;
  /** List available voices for this engine. */
  getVoices(): Promise<Voice[]>;
  /**
   * Initialize the underlying native engine. Called by `ttsRuntime` when
   * this engine becomes the active one. Idempotent at the runtime level
   * (the runtime won't call it twice without a `release` in between).
   *
   * System engine implements as a no-op — OS-native TTS does not require
   * setup.
   */
  loadInto(): Promise<void>;
  /**
   * Replay path — speak `text` in one call. Used by the v1.1 per-message
   * play button where the full text is available up-front.
   */
  play(text: string, voice: Voice): Promise<void>;
  /**
   * Streaming path — returns a handle the store feeds tokens into as the
   * LLM generates them. Lets the first sentence start playing while the
   * tail of the response is still being synthesized.
   *
   * `waitFor` delays the first synthesis until the promise resolves,
   * preventing a prior `Speech.stop()` from killing the new stream.
   */
  playStreaming(voice: Voice, waitFor?: Promise<void>): StreamingHandle;
  /** Stop any in-flight playback. Safe to call when idle. */
  stop(): Promise<void>;
}
