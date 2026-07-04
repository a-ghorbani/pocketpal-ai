/**
 * STT (Speech-to-Text) service types.
 *
 * Architecture (ADR-2026-003): Local-first STT.
 * - Primary: Local Whisper.cpp via llama.rn (offline, fully on-device)
 * - Fallback: System Speech API (iOS/Android native, no backend needed)
 *
 * Mirrors the TTS Engine pattern so the rest of the app can treat
 * both directions (text→speech, speech→text) symmetrically.
 */

export type STTEngineId = 'whisper' | 'system';

export interface STTResult {
  /** The transcribed text. */
  text: string;
  /** Confidence score 0..1, if available. */
  confidence?: number;
  /** Language code detected or used for recognition (BCP-47). */
  language?: string;
  /** Segments with timestamps, if the engine provides them. */
  segments?: STTSegment[];
}

export interface STTSegment {
  text: string;
  start: number; // seconds
  end: number; // seconds
}

export interface STTStartOptions {
  /** Desired language code (BCP-47, e.g. "en", "zh", "ja"). */
  language?: string;
  /** Sample rate in Hz (default: 16000). */
  sampleRate?: number;
  /** Enable partial results during recording. */
  enablePartial?: boolean;
}

/**
 * Callbacks delivered during an active STT session.
 */
export interface STTCallbacks {
  /** Fired when speech recognition begins. */
  onStart?: () => void;
  /** Fired with partial (interim) transcription while speaking. */
  onPartial?: (text: string) => void;
  /** Fired with the final, complete transcription. */
  onResult?: (result: STTResult) => void;
  /** Fired on error. */
  onError?: (error: Error) => void;
  /** Fired when recognition ends (normally or via cancel). */
  onEnd?: () => void;
}

/**
 * STT engine interface.
 *
 * Lifecycle:
 * 1. `isAvailable()` → check if the engine can be used
 * 2. `start(callbacks, options)` → begin listening
 * 3. `stop()` → stop and get final result
 * 4. `cancel()` → stop and discard
 */
export interface STTEngine {
  readonly id: STTEngineId;
  /** Whether the engine is available on this device. */
  isAvailable(): Promise<boolean>;
  /** Whether the engine needs a model download before use. */
  requiresModel(): boolean;
  /** Start listening for speech. */
  start(callbacks: STTCallbacks, options?: STTStartOptions): Promise<void>;
  /** Stop listening and produce the final result. */
  stop(): Promise<void>;
  /** Cancel listening and discard any results. */
  cancel(): Promise<void>;
}
