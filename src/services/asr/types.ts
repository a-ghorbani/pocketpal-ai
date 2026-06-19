/**
 * ASR (automatic speech recognition) service types.
 *
 * The whisper runtime is abstracted behind `AsrEngine` so the rest of the app
 * never touches `whisper.rn` directly. Model download/install mirrors the TTS
 * neural-engine pattern (per-tier on-disk install + version sentinel).
 */

/** Whisper model size tiers offered to the user. */
export type AsrTier = 'base' | 'small' | 'large-turbo';

/**
 * Model download lifecycle for a tier. Reuses the TTS `NeuralDownloadState`
 * shape verbatim. Derived from `isInstalled` on init — never persisted; the
 * source of truth is the file system.
 */
export type AsrDownloadState =
  | 'not_installed'
  | 'downloading'
  | 'ready'
  | 'error';

/** Push-to-talk capture state machine. */
export type CaptureState =
  | 'idle'
  | 'requesting_perm'
  | 'recording'
  | 'transcribing'
  | 'error';

/** Discrete error kinds surfaced inline in the composer. */
export type AsrErrorKind =
  | 'permission_denied'
  | 'permission_blocked'
  | 'too_short'
  | 'transcribe_failed'
  | 'not_installed';

/** Static per-tier model manifest (URL + filename + size). */
export interface AsrTierManifest {
  tier: AsrTier;
  /** Local filename of the GGML model bin. */
  modelFilename: string;
  /** HuggingFace download URL for the model bin. */
  modelUrl: string;
  /** Exact summed byte size of the downloaded file(s); feeds disk preflight. */
  estimatedBytes: number;
}

/** Progress callback (0..1) for a tier download. */
export type AsrProgressCallback = (progress: number) => void;

/** Result of energy-VAD gating a captured buffer. */
export interface VadResult {
  /** True when the buffer carries enough voiced signal to decode. */
  passed: boolean;
  /** Measured RMS amplitude (normalized 0..1). */
  rms: number;
  /** Captured duration in ms. */
  durationMs: number;
}

/**
 * Speech-recognition engine. One install per tier on disk; install truth is
 * the file system (model file + current-version sentinel), never a store flag.
 */
export interface AsrEngine {
  /** True when the tier's model file(s) + current-version sentinel exist. */
  isInstalled(tier: AsrTier): Promise<boolean>;
  /**
   * Download a tier's model bundle. The version sentinel is the final disk
   * write so an interrupted download never reports installed.
   */
  downloadModel(tier: AsrTier, onProgress?: AsrProgressCallback): Promise<void>;
  /** Delete a tier's on-disk model bundle. */
  deleteModel(tier: AsrTier): Promise<void>;
  /** Reclaim a tier's stale model dir before a (re)download. Idempotent. */
  reclaimLegacySpace(tier: AsrTier): Promise<void>;
  /**
   * Transcribe a captured 16 kHz mono PCM buffer (base64-encoded float32).
   * Runs entirely on-device; no network. `language` defaults to auto-detect.
   */
  transcribe(
    pcmBase64Float32: string,
    opts?: {tier: AsrTier; language?: string},
  ): Promise<string>;
  /** Release any loaded native whisper context. */
  release(): Promise<void>;
}
