/**
 * Sample text used for the voice preview button in Setup UI (v1.1).
 * Lives here so the service and future UI share a single string.
 */
export const TTS_PREVIEW_SAMPLE = "Hello, I'm your AI assistant.";

/** Minimum total RAM required to enable the TTS feature (6 GiB). */
export const TTS_MIN_RAM_BYTES = 6 * 1024 * 1024 * 1024;

/** Subdirectory (relative to app documents dir) used for Supertonic model files. */
export const SUPERTONIC_MODEL_SUBDIR = 'tts/supertonic';
