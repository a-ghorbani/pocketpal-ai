import type {Voice} from './types';

/**
 * Sample text used for the voice preview button in Setup UI (v1.1).
 * Lives here so the service and future UI share a single string.
 */
export const TTS_PREVIEW_SAMPLE = "Hello, I'm your AI assistant.";

/** Minimum total RAM required to enable the TTS feature (6 GiB). */
export const TTS_MIN_RAM_BYTES = 6 * 1024 * 1024 * 1024;

/** Subdirectory (relative to app documents dir) used for Supertonic model files. */
export const SUPERTONIC_MODEL_SUBDIR = 'tts/supertonic';

/**
 * Supertonic voice catalog (10 voices: 5 female, 5 male).
 *
 * Engine is wired but Supertonic inference itself is STUBBED in v1.0 —
 * the catalog is declared here so the v1.1 UI has something to render and
 * v1.2 can flip the engine on without touching the list.
 */
export const SUPERTONIC_VOICES: Voice[] = [
  {id: 'F1', name: 'Sarah', engine: 'supertonic', language: 'en', gender: 'f'},
  {id: 'F2', name: 'Lily', engine: 'supertonic', language: 'en', gender: 'f'},
  {
    id: 'F3',
    name: 'Jessica',
    engine: 'supertonic',
    language: 'en',
    gender: 'f',
  },
  {
    id: 'F4',
    name: 'Olivia',
    engine: 'supertonic',
    language: 'en',
    gender: 'f',
  },
  {id: 'F5', name: 'Emily', engine: 'supertonic', language: 'en', gender: 'f'},
  {id: 'M1', name: 'Alex', engine: 'supertonic', language: 'en', gender: 'm'},
  {id: 'M2', name: 'James', engine: 'supertonic', language: 'en', gender: 'm'},
  {id: 'M3', name: 'Robert', engine: 'supertonic', language: 'en', gender: 'm'},
  {id: 'M4', name: 'Sam', engine: 'supertonic', language: 'en', gender: 'm'},
  {id: 'M5', name: 'Daniel', engine: 'supertonic', language: 'en', gender: 'm'},
];
