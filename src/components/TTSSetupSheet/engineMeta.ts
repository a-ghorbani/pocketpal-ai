import {Platform} from 'react-native';

import type {EngineId} from '../../services/tts';

/**
 * Per-engine metadata used across the sheet for branding, spec strips
 * and group headers. Single source of truth — extend here when adding
 * a new engine.
 */
export interface EngineMeta {
  title: string;
  tagline: string;
  /** ~MB on disk after install (0 for system). */
  sizeMb: number;
  /** Voice count for spec strip. */
  voices: number;
  /** Short language code(s) for spec strip. */
  language: string;
  /** Single-word performance tier shown in group header. */
  tier: 'fast' | 'balanced' | 'best' | 'native';
  accent: string;
  gradientFrom: string;
  gradientTo: string;
}

export const ENGINE_META: Record<EngineId, EngineMeta> = {
  kitten: {
    title: 'Kitten',
    tagline: 'Warm and friendly. Runs on the smallest devices.',
    sizeMb: 57,
    voices: 8,
    language: 'EN',
    tier: 'fast',
    accent: '#F29547',
    gradientFrom: 'rgba(242, 149, 71, 0.12)',
    gradientTo: 'rgba(242, 149, 71, 0.02)',
  },
  kokoro: {
    title: 'Kokoro',
    tagline: 'Balanced and expressive. 28 voices across accents.',
    sizeMb: 86,
    voices: 28,
    language: 'EN',
    tier: 'balanced',
    accent: '#6F5CD6',
    gradientFrom: 'rgba(111, 92, 214, 0.14)',
    gradientTo: 'rgba(111, 92, 214, 0.02)',
  },
  supertonic: {
    title: 'Supertonic',
    tagline: 'Fastest. Cinematic quality at low step counts.',
    sizeMb: 265,
    voices: 10,
    language: 'EN',
    tier: 'best',
    accent: '#1E4DF6',
    gradientFrom: 'rgba(30, 77, 246, 0.14)',
    gradientTo: 'rgba(30, 77, 246, 0.02)',
  },
  system: {
    title: Platform.OS === 'ios' ? 'iOS Voices' : 'Android Voices',
    tagline: 'Built into your device. Always available, offline.',
    sizeMb: 0,
    voices: 0,
    language: '—',
    tier: 'native',
    accent: '#7B8896',
    gradientFrom: 'rgba(123, 136, 150, 0.10)',
    gradientTo: 'rgba(123, 136, 150, 0.02)',
  },
};
