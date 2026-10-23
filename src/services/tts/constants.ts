import {Platform} from 'react-native';

import type {NeuralEngineId} from './types';

/**
 * Sample text used for the voice preview button in Setup UI (v1.1).
 * Lives here so the service and future UI share a single string.
 */
export const TTS_PREVIEW_SAMPLE =
  "Oh, hello there! I've been waiting for you to test me. I sound pretty good!";

/** Minimum total RAM required to enable the TTS feature (4 GiB). */
export const TTS_MIN_RAM_BYTES = 4 * 1024 * 1024 * 1024;

/** Peak runtime memory of each neural engine once loaded. */
export const TTS_ENGINE_RUNTIME_BYTES: Record<NeuralEngineId, number> = {
  supertonic: 500_000_000,
  kokoro: 500_000_000,
  kitten: 200_000_000,
  phonon: 200 * 1024 * 1024,
};

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

// ---------------------------------------------------------------------------
// Phonon (31m English only; the 40m models are CC BY-NC and never used)
// ---------------------------------------------------------------------------

/** Subdirectory for Phonon model files. */
export const PHONON_MODEL_SUBDIR = 'tts/phonon';

/** Install generation; bump to force a clean re-download. */
export const PHONON_MODEL_VERSION = 1;

/** Install sentinel, written last so an interrupted download never counts. */
export const PHONON_VERSION_SENTINEL_FILENAME = 'model-version.json';

export const PHONON_HF_BASE_URL = 'https://huggingface.co';

export interface PhononPinnedFile {
  name: string;
  size: number;
  sha256: string;
}

/** Android checkpoint, `modelPath` of the Android engine. */
export const PHONON_ANDROID_REPO = 'gradium/phonon-31m-en';
export const PHONON_ANDROID_REVISION =
  '52433c46975bfa13144c56204c9f4ee1c5b148aa';
export const PHONON_ANDROID_FILES: readonly PhononPinnedFile[] = [
  {
    name: 'config.json',
    size: 2851,
    sha256: '7062ea376e6b158543c8abec8e5af67df171c49ad70eb7e2a0fb25c16f265e06',
  },
  {
    name: 'tokenizer.json',
    size: 277967,
    sha256: '691a00068fa7b989f2f3e5ae5daa2d1a5bb319f2d5360deafcfb19a8bb6e7936',
  },
  {
    name: 'model.q8.gguf',
    size: 64512352,
    sha256: 'a7d9aad2cd6dc66473f24a08bc6d2939030ef4d751ef82349361fbef3272dbae',
  },
  {
    name: 'default-voice.safetensors',
    size: 256136,
    sha256: 'f739e8c4c76ee7f92e7c94a82002748c8cd22e99582ac49f7b9b94cd63786e18',
  },
];

export interface PhononVoicePin {
  name: string;
  voiceId: string;
  locale: 'en-us' | 'en-gb';
  gender: 'female' | 'male';
  description: string;
  sha256: string;
}

/**
 * Curated Android voices, fetched by `voiceId` and saved under `name`
 * (the engine's voice id is the file stem).
 */
export const PHONON_VOICES_REPO = 'gradium/phonon-voices';
export const PHONON_VOICES_REVISION =
  'da6c9ec0d47be8df5c87c730a3aa97187f3229c3';
export const PHONON_VOICE_FILE_SIZE = 256136;
export const PHONON_VOICE_PINS: readonly PhononVoicePin[] = [
  {
    name: 'Zoey',
    voiceId: 'NbpkqMVS3CJeq2j8',
    locale: 'en-us',
    gender: 'female',
    description: 'Playful and upbeat, standard American accent',
    sha256: '97c7f8c253413574406ab80dd23f49c3ebb2517163b00a9bf86b9c4cf43e7e23',
  },
  {
    name: 'Juniper',
    voiceId: 'NIWIOv5vTi5eRMj8',
    locale: 'en-us',
    gender: 'female',
    description: 'Cheerful, personable, resonant',
    sha256: '444378eb06b7c492b86e8fc7d13e4db1a3c0cf3e68891a960bf6f0a41a13ef35',
  },
  {
    name: 'Harper',
    voiceId: '4SZHfMpw-p46Ywgs',
    locale: 'en-us',
    gender: 'female',
    description: 'Modern, confident and friendly',
    sha256: '6b3da6e2d796a20c51af892c482bd6509fb88267a221aff83c870843dee2a123',
  },
  {
    name: 'Easton',
    voiceId: 'LMDIYE0Oa377Qh6Z',
    locale: 'en-us',
    gender: 'male',
    description: 'Punchy and close in, crisp consonants',
    sha256: '45c582673cb20edb04ddcca2b5a8865ddfb0a82599efadb269021e87d20fbdd4',
  },
  {
    name: 'Micah',
    voiceId: '40QrMVgAxFiUnP9f',
    locale: 'en-us',
    gender: 'male',
    description: 'Buoyant, high energy, playful lift',
    sha256: '0de1098d1051686a138d068e83ff09deb5053328bc74ec9541a1fdb90bfc24da',
  },
  {
    name: 'Trevor',
    voiceId: '0zLApsZfVLLNaEGl',
    locale: 'en-us',
    gender: 'male',
    description: 'Buoyant over a resonant mid-low core',
    sha256: 'dc1341c8937af5534e6bbcc5c0fc5e7c10312229b59061228074f93683fe2261',
  },
  {
    name: 'Maeve',
    voiceId: '6PWnV0Nq4wu7RVBT',
    locale: 'en-gb',
    gender: 'female',
    description: 'Sparky, attentive British English',
    sha256: '56494ee67d533ad227ff0dfd0b1c13ff5aa91f1ad6e596e66c2986ba3005e844',
  },
  {
    name: 'Alfie',
    voiceId: 'X6NceqF285Gr04gb',
    locale: 'en-gb',
    gender: 'male',
    description: 'Punchy and forward British English',
    sha256: '4de75497fff3030168e8aa6dca23ffeb332b1bc8c25d0bf3507ceadac953ae9c',
  },
];

/** Display metadata for the curated voices, passed as `voicesMetadataPath`. */
export const PHONON_VOICES_JSONL_FILENAME = 'voices.jsonl';

/**
 * iOS: precompiled Core ML bundle mirrored file by file, listed in a
 * `path<TAB>size<TAB>sha256` manifest at the repo root.
 */
export const PHONON_IOS_REPO = 'palshub/phonon-31m-en-coreml';
export const PHONON_IOS_REVISION = '0222045816b825e8a004013c7158b111245b4aab';
export const PHONON_IOS_BUNDLE_NAME = 'phonon-31m-en-coreml';
export const PHONON_IOS_MANIFEST_PATH = 'phonon-31m-en-coreml.manifest.tsv';
export const PHONON_IOS_MANIFEST_SHA256 =
  '4f91af242637d13a93f38a574e4f99466a3063aa5a7d24fc34a797f53b12599a';
/** Local copy of the verified manifest, the iOS install file list. */
export const PHONON_IOS_MANIFEST_FILENAME = 'manifest.tsv';

/** Exact pinned byte totals; they feed the disk-space preflight. */
export const PHONON_ANDROID_MODEL_BYTES = 67_098_394;
export const PHONON_IOS_MODEL_BYTES = 171_554_733;
export const PHONON_MODEL_ESTIMATED_BYTES =
  Platform.OS === 'ios' ? PHONON_IOS_MODEL_BYTES : PHONON_ANDROID_MODEL_BYTES;
