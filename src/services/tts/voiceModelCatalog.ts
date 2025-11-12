import type {VoiceModelCatalogEntry} from '../../types/tts';

/**
 * Curated catalog of Piper TTS voice models
 *
 * Models are sourced from Hugging Face:
 * https://huggingface.co/rhasspy/piper-voices
 *
 * URL structure:
 * https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/{lang}/{locale}/{voice}/{quality}/{file}
 *
 * Note: Individual file downloads are used instead of tar.gz for easier mobile integration.
 * Each voice requires 3 files: .onnx model, .onnx.json config, and tokens.txt
 */

const HF_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0';

export const VOICE_MODEL_CATALOG: VoiceModelCatalogEntry[] = [
  // ============ English (US) ============
  {
    identifier: 'en_US-amy-low',
    name: 'Amy (Low Quality)',
    language: 'en-US',
    quality: 'low',
    numSpeakers: 1,
    sampleRate: 22050,
    size: 10485760, // ~10MB
    downloadUrl: `${HF_BASE}/en/en_US/amy/low/en_US-amy-low.onnx`,
    gender: 'female',
    description:
      'Fast, lightweight English voice. Good for testing and low-resource devices.',
    files: {
      model: 'en_US-amy-low.onnx',
      tokens: 'en_US-amy-low.onnx.json',
      data: 'espeak-ng-data',
    },
  },
  {
    identifier: 'en_US-ryan-medium',
    name: 'Ryan (Medium Quality)',
    language: 'en-US',
    quality: 'medium',
    numSpeakers: 1,
    sampleRate: 22050,
    size: 20971520, // ~20MB
    downloadUrl: `${HF_BASE}/en/en_US/ryan/medium/en_US-ryan-medium.onnx`,
    gender: 'male',
    description:
      'Natural-sounding male voice with good quality and reasonable size.',
    files: {
      model: 'en_US-ryan-medium.onnx',
      tokens: 'en_US-ryan-medium.onnx.json',
      data: 'espeak-ng-data',
    },
  },
  {
    identifier: 'en_US-lessac-medium',
    name: 'Lessac (Medium Quality)',
    language: 'en-US',
    quality: 'medium',
    numSpeakers: 1,
    sampleRate: 22050,
    size: 20971520, // ~20MB
    downloadUrl: `${HF_BASE}/en/en_US/lessac/medium/en_US-lessac-medium.onnx`,
    gender: 'female',
    description: 'Clear female voice with excellent pronunciation.',
    files: {
      model: 'en_US-lessac-medium.onnx',
      tokens: 'en_US-lessac-medium.onnx.json',
      data: 'espeak-ng-data',
    },
  },
  {
    identifier: 'en_US-libritts-high',
    name: 'LibriTTS (High Quality)',
    language: 'en-US',
    quality: 'high',
    numSpeakers: 1,
    sampleRate: 22050,
    size: 52428800, // ~50MB
    downloadUrl: `${HF_BASE}/en/en_US/libritts/high/en_US-libritts-high.onnx`,
    gender: 'neutral',
    description:
      'Highest quality English voice. Larger size but excellent naturalness.',
    files: {
      model: 'en_US-libritts-high.onnx',
      tokens: 'en_US-libritts-high.onnx.json',
      data: 'espeak-ng-data',
    },
  },

  // ============ English (GB) ============
  {
    identifier: 'en_GB-alan-medium',
    name: 'Alan (Medium Quality)',
    language: 'en-GB',
    quality: 'medium',
    numSpeakers: 1,
    sampleRate: 22050,
    size: 20971520, // ~20MB
    downloadUrl: `${HF_BASE}/en/en_GB/alan/medium/en_GB-alan-medium.onnx`,
    gender: 'male',
    description: 'British English male voice with clear pronunciation.',
    files: {
      model: 'en_GB-alan-medium.onnx',
      tokens: 'en_GB-alan-medium.onnx.json',
      data: 'espeak-ng-data',
    },
  },

  // ============ Spanish ============
  {
    identifier: 'es_ES-davefx-medium',
    name: 'Davefx (Medium Quality)',
    language: 'es-ES',
    quality: 'medium',
    numSpeakers: 1,
    sampleRate: 22050,
    size: 20971520, // ~20MB
    downloadUrl: `${HF_BASE}/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx`,
    gender: 'male',
    description: 'Spanish (Spain) male voice with natural intonation.',
    files: {
      model: 'es_ES-davefx-medium.onnx',
      tokens: 'es_ES-davefx-medium.onnx.json',
      data: 'espeak-ng-data',
    },
  },

  // ============ French ============
  {
    identifier: 'fr_FR-siwis-medium',
    name: 'Siwis (Medium Quality)',
    language: 'fr-FR',
    quality: 'medium',
    numSpeakers: 1,
    sampleRate: 22050,
    size: 20971520, // ~20MB
    downloadUrl: `${HF_BASE}/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx`,
    gender: 'female',
    description: 'French female voice with clear articulation.',
    files: {
      model: 'fr_FR-siwis-medium.onnx',
      tokens: 'fr_FR-siwis-medium.onnx.json',
      data: 'espeak-ng-data',
    },
  },

  // ============ German ============
  {
    identifier: 'de_DE-thorsten-medium',
    name: 'Thorsten (Medium Quality)',
    language: 'de-DE',
    quality: 'medium',
    numSpeakers: 1,
    sampleRate: 22050,
    size: 20971520, // ~20MB
    downloadUrl: `${HF_BASE}/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx`,
    gender: 'male',
    description: 'German male voice with natural pronunciation.',
    files: {
      model: 'de_DE-thorsten-medium.onnx',
      tokens: 'de_DE-thorsten-medium.onnx.json',
      data: 'espeak-ng-data',
    },
  },
];

/**
 * Get voice models by language
 */
export function getVoicesByLanguage(
  language: string,
): VoiceModelCatalogEntry[] {
  return VOICE_MODEL_CATALOG.filter(v => v.language === language);
}

/**
 * Get all available languages
 */
export function getAvailableLanguages(): string[] {
  return Array.from(new Set(VOICE_MODEL_CATALOG.map(v => v.language)));
}

/**
 * Get voice model by identifier
 */
export function getVoiceById(
  identifier: string,
): VoiceModelCatalogEntry | undefined {
  return VOICE_MODEL_CATALOG.find(v => v.identifier === identifier);
}
