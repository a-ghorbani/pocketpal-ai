/**
 * Sample text used for the voice preview button in Setup UI (v1.1).
 * Lives here so the service and future UI share a single string.
 */
export const TTS_PREVIEW_SAMPLE = "Hello, I'm your AI assistant.";

/** Minimum total RAM required to enable the TTS feature (6 GiB). */
export const TTS_MIN_RAM_BYTES = 6 * 1024 * 1024 * 1024;

/** Subdirectory (relative to app documents dir) used for Supertonic model files. */
export const SUPERTONIC_MODEL_SUBDIR = 'tts/supertonic';

/** Parent `tts/` directory (iOS backup exclusion applied here during mkdir). */
export const TTS_PARENT_SUBDIR = 'tts';

/**
 * HuggingFace base URL for the v1 (English-only) Supertonic model.
 *
 * Traced from the upstream fork example app
 * (`@mhpdev/react-native-speech/example/src/utils/SupertonicModelManager.ts`)
 * at pinned SHA `3ae0094b094d7c3d4e17378e53199813384e88f9`. v2 (multilingual)
 * is deferred — v1.2 ships v1 only.
 */
export const SUPERTONIC_MODEL_BASE_URL =
  'https://huggingface.co/Supertone/supertonic/resolve/main';

/**
 * Voice-style embeddings base URL — recorded in the local
 * `voices-manifest.json` so the fork's `StyleLoader` can fetch per-voice
 * style embeddings on first play.
 */
export const SUPERTONIC_VOICES_BASE_URL = `${SUPERTONIC_MODEL_BASE_URL}/voice_styles`;

/**
 * The five network-downloaded files that make up the Supertonic v1 pipeline.
 * A sixth file (`voices-manifest.json`) is synthesized locally after
 * download.
 */
export const SUPERTONIC_MODEL_FILES = [
  {name: 'duration_predictor.onnx', urlPath: 'onnx/duration_predictor.onnx'},
  {name: 'text_encoder.onnx', urlPath: 'onnx/text_encoder.onnx'},
  {name: 'vector_estimator.onnx', urlPath: 'onnx/vector_estimator.onnx'},
  {name: 'vocoder.onnx', urlPath: 'onnx/vocoder.onnx'},
  {name: 'unicode_indexer.json', urlPath: 'onnx/unicode_indexer.json'},
] as const;

/** Name of the voices manifest generated locally after model download. */
export const SUPERTONIC_VOICES_MANIFEST_FILENAME = 'voices-manifest.json';

/** Estimated total size of the v1 model bundle (~265 MB). */
export const SUPERTONIC_MODEL_ESTIMATED_BYTES = 265 * 1024 * 1024;
