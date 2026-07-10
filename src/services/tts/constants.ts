/**
 * Sample text used for the voice preview button in Setup UI (v1.1).
 * Lives here so the service and future UI share a single string.
 */
export const TTS_PREVIEW_SAMPLE =
  "Oh, hello there! I've been waiting for you to test me. I sound pretty good!";

/** Minimum total RAM required to enable the TTS feature (4 GiB). */
export const TTS_MIN_RAM_BYTES = 4 * 1024 * 1024 * 1024;

/** Subdirectory (relative to app documents dir) used for Supertonic model files. */
export const SUPERTONIC_MODEL_SUBDIR = 'tts/supertonic';

/** Subdirectory for Kokoro model files. */
export const KOKORO_MODEL_SUBDIR = 'tts/kokoro';

/** Subdirectory for Kitten model files. */
export const KITTEN_MODEL_SUBDIR = 'tts/kitten';

/** Parent `tts/` directory (iOS backup exclusion applied here during mkdir). */
export const TTS_PARENT_SUBDIR = 'tts';

/**
 * HuggingFace base URL for the Supertonic v3 (31-language) model.
 *
 * v3 preserves the 5-file manifest, filenames, and 10-voice catalog of v2
 * while covering 31 languages plus a trained language-agnostic `<na>` tag.
 * Because the filenames are identical to v2, a local version sentinel
 * (`SUPERTONIC_VERSION_SENTINEL_FILENAME`) distinguishes a stale v2 install
 * from v3; see the supertonic engine and architecture/tts.md.
 */
export const SUPERTONIC_MODEL_BASE_URL =
  'https://huggingface.co/Supertone/supertonic-3/resolve/main';

/**
 * On-disk model generation this app expects. Bumped from the unversioned v2
 * to 3 when Supertonic gained all 31 languages + the trained `na` tag. The
 * version sentinel written after a successful download records this value;
 * `isInstalled()` requires it to match, forcing a one-time v2 re-download.
 */
export const SUPERTONIC_MODEL_VERSION = 3;

/**
 * Local sentinel file recording the installed Supertonic model version.
 * Lives in the model dir so the whole-dir reclaim removes it on re-download.
 * Written as the final step of `downloadModel()` so an interrupted download
 * never reports as installed.
 */
export const SUPERTONIC_VERSION_SENTINEL_FILENAME = 'model-version.json';

/**
 * Voice-style embeddings base URL — recorded in the local
 * `voices-manifest.json` so the fork's `StyleLoader` can fetch per-voice
 * style embeddings on first play.
 */
export const SUPERTONIC_VOICES_BASE_URL = `${SUPERTONIC_MODEL_BASE_URL}/voice_styles`;

/**
 * The five network-downloaded files that make up the Supertonic pipeline.
 * v3 preserves the v2 filenames; a sixth file (`voices-manifest.json`) and a
 * version sentinel are synthesized locally after download.
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

/**
 * Total size of the Supertonic v3 model bundle: the exact summed byte size
 * of the 5 downloaded files (4 onnx + unicode_indexer.json) on HuggingFace
 * (Supertone/supertonic-3). Feeds the disk-space preflight (`estimated * 1.2`),
 * so it must be >= the real total, not just a UI label. ~380 MB.
 */
export const SUPERTONIC_MODEL_ESTIMATED_BYTES = 398_352_949;

// ---------------------------------------------------------------------------
// Kokoro (FP32 variant)
// ---------------------------------------------------------------------------

/**
 * HuggingFace base URL for Kokoro 82M v1.0 ONNX community port.
 * Full-precision (FP32) variant. The FP16 weights produce silent audio on
 * some devices (numeric overflow during inference); FP32 trades disk + RAM
 * for correctness everywhere: ~330 MB on disk, ~1 GB peak RAM. Q8 also
 * produces garbage on some Android ONNX Runtime builds, so neither
 * quantized variant is viable today.
 */
export const KOKORO_MODEL_BASE_URL =
  'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main';

/** Base URL for the Kokoro per-voice `.bin` embedding files. */
export const KOKORO_VOICES_BASE_URL = `${KOKORO_MODEL_BASE_URL}/voices`;

/**
 * Core Kokoro files — downloaded all-or-nothing (Phase 1). Without these
 * the engine cannot initialize. Local name is `model_fp32.onnx` so users
 * who previously downloaded the FP16 weights (saved as `model.onnx`) get
 * a clean re-download instead of inheriting the silent-audio bug.
 */
export const KOKORO_MODEL_FILES = [
  {name: 'model_fp32.onnx', urlPath: 'onnx/model.onnx'},
  {name: 'tokenizer.json', urlPath: 'tokenizer.json'},
] as const;

/**
 * IPA dictionary for the MIT `phonemize` JS phonemizer (required by the
 * default `phonemizerType: 'js'` path in Kokoro/Kitten). Built from
 * en-us.tsv via `npm run build:dict` in the fork; hosted as a HF dataset
 * so both engines share one download origin.
 */
export const TTS_DICT_URL =
  'https://huggingface.co/datasets/palshub/phonemizer-dicts/resolve/main/en-us.bin';

/** Local filename for the IPA dict (saved inside each engine's model dir). */
export const TTS_DICT_FILENAME = 'en-us.bin';

/** Name of the Kokoro voices manifest generated locally after download. */
export const KOKORO_VOICES_MANIFEST_FILENAME = 'voices-manifest.json';

/** Estimated total size of the Kokoro FP32 model bundle (~330 MB including voices). */
export const KOKORO_MODEL_ESTIMATED_BYTES = 330 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Kitten (nano-fp32 variant)
// ---------------------------------------------------------------------------

/** HuggingFace base URL for the Kitten nano-fp32 model. */
export const KITTEN_MODEL_BASE_URL =
  'https://huggingface.co/palshub/kitten-tts-nano-0.8-fp32/resolve/main';

/**
 * Kitten files: the ONNX model (saved locally as `kitten.onnx`) and the
 * voices manifest JSON. The IPA dict is downloaded separately via
 * `TTS_DICT_URL` into the same directory.
 */
export const KITTEN_MODEL_FILES = [
  {name: 'kitten.onnx', urlPath: 'kitten_tts_nano_v0_8.onnx'},
  {name: 'voices-manifest.json', urlPath: 'voices-manifest.json'},
] as const;

/** Estimated total size of the Kitten model bundle (~57 MB + dict). */
export const KITTEN_MODEL_ESTIMATED_BYTES = 57 * 1024 * 1024;
