/**
 * Kokoro Model Catalog
 * Defines available Kokoro models for download
 */

import type {KokoroModelInfo} from '../../../types/tts';

/**
 * Catalog entry for a downloadable Kokoro model
 */
export interface KokoroModelCatalogEntry {
  version: string;
  variant: 'full' | 'fp16' | 'q8' | 'quantized';
  size: number; // Size in bytes
  description: string;
  recommended: boolean;
  downloadUrls: {
    model: string; // kokoro-*.onnx
    vocab: string; // vocab.json
    merges: string; // merges.txt
    voices: string; // voices.bin
  };
}

/**
 * Available Kokoro models
 * Update these URLs with actual model hosting locations
 */
export const KOKORO_MODEL_CATALOG: KokoroModelCatalogEntry[] = [
  {
    version: '1.0',
    variant: 'q8',
    size: 83886080, // ~80MB
    description:
      'Quantized model (8-bit). Best balance of quality and size. Recommended for most users.',
    recommended: true,
    downloadUrls: {
      // TODO: Replace with actual download URLs
      // These could be from GitHub releases, CDN, or your own server
      model: 'https://example.com/models/kokoro-v1.0-q8.onnx',
      vocab: 'https://example.com/models/vocab.json',
      merges: 'https://example.com/models/merges.txt',
      voices: 'https://example.com/models/voices-v1.0.bin',
    },
  },
  {
    version: '1.0',
    variant: 'fp16',
    size: 167772160, // ~160MB
    description:
      'Half-precision model. Better quality than quantized, larger size.',
    recommended: false,
    downloadUrls: {
      model: 'https://example.com/models/kokoro-v1.0-fp16.onnx',
      vocab: 'https://example.com/models/vocab.json',
      merges: 'https://example.com/models/merges.txt',
      voices: 'https://example.com/models/voices-v1.0.bin',
    },
  },
  {
    version: '1.0',
    variant: 'full',
    size: 335544320, // ~320MB
    description: 'Full precision model. Highest quality, largest size.',
    recommended: false,
    downloadUrls: {
      model: 'https://example.com/models/kokoro-v1.0.onnx',
      vocab: 'https://example.com/models/vocab.json',
      merges: 'https://example.com/models/merges.txt',
      voices: 'https://example.com/models/voices-v1.0.bin',
    },
  },
];

/**
 * Get recommended model
 */
export function getRecommendedModel(): KokoroModelCatalogEntry {
  return (
    KOKORO_MODEL_CATALOG.find(m => m.recommended) ?? KOKORO_MODEL_CATALOG[0]
  );
}

/**
 * Get model by variant
 */
export function getModelByVariant(
  variant: 'full' | 'fp16' | 'q8' | 'quantized',
): KokoroModelCatalogEntry | undefined {
  return KOKORO_MODEL_CATALOG.find(m => m.variant === variant);
}

/**
 * Get all available models
 */
export function getAllModels(): KokoroModelCatalogEntry[] {
  return KOKORO_MODEL_CATALOG;
}

/**
 * Create a model info from catalog entry
 */
export function createModelInfo(
  entry: KokoroModelCatalogEntry,
): KokoroModelInfo {
  return {
    version: entry.version,
    variant: entry.variant,
    size: entry.size,
    isDownloaded: false,
    // Paths will be set after download
    modelPath: undefined,
    vocabPath: undefined,
    mergesPath: undefined,
    voicesPath: undefined,
  };
}
