import type {Voice} from '../../types';

/**
 * Kitten TTS nano voice catalog (8 voices, English only).
 *
 * IDs match the internal NPZ keys used by the fork's `KITTEN_BUILTIN_VOICES`
 * so the engine can look up embeddings directly. Display names are the
 * human-friendly aliases (Bella, Jasper, …).
 */
export const KITTEN_VOICES: Voice[] = [
  {id: 'expr-voice-2-f', name: 'Bella', engine: 'kitten', language: 'en', gender: 'f'},
  {id: 'expr-voice-3-f', name: 'Luna', engine: 'kitten', language: 'en', gender: 'f'},
  {id: 'expr-voice-4-f', name: 'Rosie', engine: 'kitten', language: 'en', gender: 'f'},
  {id: 'expr-voice-5-f', name: 'Kiki', engine: 'kitten', language: 'en', gender: 'f'},
  {id: 'expr-voice-2-m', name: 'Jasper', engine: 'kitten', language: 'en', gender: 'm'},
  {id: 'expr-voice-3-m', name: 'Bruno', engine: 'kitten', language: 'en', gender: 'm'},
  {id: 'expr-voice-4-m', name: 'Hugo', engine: 'kitten', language: 'en', gender: 'm'},
  {id: 'expr-voice-5-m', name: 'Leo', engine: 'kitten', language: 'en', gender: 'm'},
];
