import type {AsrTier, AsrTierManifest} from './types';

/**
 * Minimum total RAM to enable on-device voice input by default (4 GiB).
 * Mirrors the TTS memory gate. Below this the feature is hidden unless the
 * user explicitly opts in via Settings (see ASRStore availability gate).
 */
export const ASR_MIN_RAM_BYTES = 4 * 1024 * 1024 * 1024;

/**
 * Maximum push-to-talk recording length (ms). Bounds the in-memory PCM
 * buffer; reaching it ends capture as if the user released the button.
 */
export const ASR_MAX_RECORD_MS = 30_000;

/** Capture sample rate (Hz). Whisper operates on 16 kHz mono PCM. */
export const ASR_SAMPLE_RATE = 16_000;

/** Capture channel count (mono). */
export const ASR_CHANNELS = 1;

/** Capture bit depth (16-bit signed PCM, the pcm-stream native default). */
export const ASR_BITS_PER_SAMPLE = 16;

/**
 * Energy-VAD floor. A captured buffer whose RMS amplitude (normalized to
 * [0,1]) is below this, or whose voiced duration is shorter than
 * `ASR_MIN_SPEECH_MS`, is treated as silence and never decoded — Whisper is
 * autoregressive and hallucinates text on silence. See energyVad.ts.
 */
export const ASR_VAD_RMS_FLOOR = 0.01;

/** Minimum voiced duration (ms) required before a buffer is decoded. */
export const ASR_MIN_SPEECH_MS = 300;

/** Subdirectory (relative to the platform model root) for ASR model files. */
export const ASR_PARENT_SUBDIR = 'asr';

/**
 * On-disk model generation this app expects. The version sentinel written as
 * the final step of a successful download records this value; `isInstalled`
 * requires it to match, forcing a clean re-download when a tier's file layout
 * or version changes.
 */
export const ASR_MODEL_VERSION = 1;

/** Local sentinel file recording a tier's installed model version. */
export const ASR_VERSION_SENTINEL_FILENAME = 'model-version.json';

/**
 * Sentinel stored on `downloadError[tier]` when a download is blocked by the
 * disk-space preflight (rather than a network/IO failure). The Settings tier
 * row checks for this exact value to render the insufficient-storage line.
 * Namespaced so it can never collide with a real `Error.message`.
 */
export const ASR_INSUFFICIENT_STORAGE = 'asr::insufficient-storage';

/** HuggingFace base URL for the whisper.cpp GGML models. */
const WHISPER_CPP_BASE_URL =
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';

/**
 * Per-tier model manifests. Each tier is an independent on-disk install with
 * its own subdirectory and sentinel. `estimatedBytes` is the exact summed
 * HuggingFace byte total of the downloaded file(s), feeding the disk-space
 * preflight (`estimated * 1.2`), so it must be >= the real total.
 *
 * The iOS CoreML encoder sidecar (`ggml-<size>-encoder.mlmodelc`) is an
 * optional accelerator: its absence degrades to the GGUF CPU path and never
 * blocks transcription, so it is not part of the install-truth manifest.
 */
export const ASR_TIERS: Record<AsrTier, AsrTierManifest> = {
  base: {
    tier: 'base',
    modelFilename: 'ggml-base-q5_1.bin',
    modelUrl: `${WHISPER_CPP_BASE_URL}/ggml-base-q5_1.bin`,
    estimatedBytes: 59_707_625,
  },
  small: {
    tier: 'small',
    modelFilename: 'ggml-small-q8_0.bin',
    modelUrl: `${WHISPER_CPP_BASE_URL}/ggml-small-q8_0.bin`,
    estimatedBytes: 264_464_607,
  },
  'large-turbo': {
    tier: 'large-turbo',
    modelFilename: 'ggml-large-v3-turbo-q5_0.bin',
    modelUrl: `${WHISPER_CPP_BASE_URL}/ggml-large-v3-turbo-q5_0.bin`,
    estimatedBytes: 574_041_195,
  },
};

/** Default tier: small q8_0 — near-lossless multilingual, ARM-dotprod fast. */
export const ASR_DEFAULT_TIER: AsrTier = 'small';

/** Ordered tiers for UI listing (low-end → flagship). */
export const ASR_TIER_ORDER: AsrTier[] = ['base', 'small', 'large-turbo'];
