import {Platform} from 'react-native';

import type {EngineId} from '../../services/tts';

/**
 * Per-engine metadata used across the sheet for branding, spec strips
 * and group headers. Single source of truth — extend here when adding
 * a new engine.
 *
 * RAM and tier come from on-device benchmarks (FOU-47, iPhone 13 Pro,
 * Release, 152-char prompt). Numbers are approximate peak resident MB
 * during inference, not disk footprint.
 */
export interface EngineMeta {
  title: string;
  tagline: string;
  /** ~MB on disk after install (0 for system). */
  sizeMb: number;
  /** ~Peak RAM during synthesis, MB (0 for system / unknown). */
  ramMb: number;
  /** Voice count for spec strip. */
  voices: number;
  /** Short tier shown in the group header subtitle. */
  tier: 'lightest' | 'best quality' | 'fastest start' | 'native';
  accent: string;
  gradientFrom: string;
  gradientTo: string;
}

export const ENGINE_META: Record<EngineId, EngineMeta> = {
  kitten: {
    title: 'Kitten',
    tagline: 'Smallest footprint. Reliable. Best on older devices.',
    sizeMb: 57,
    ramMb: 235,
    voices: 8,
    tier: 'lightest',
    accent: '#F29547',
    gradientFrom: 'rgba(242, 149, 71, 0.12)',
    gradientTo: 'rgba(242, 149, 71, 0.02)',
  },
  kokoro: {
    title: 'Kokoro',
    tagline: 'Highest quality. ~4s warm-up before first audio.',
    sizeMb: 86,
    ramMb: 304,
    voices: 28,
    tier: 'best quality',
    accent: '#6F5CD6',
    gradientFrom: 'rgba(111, 92, 214, 0.14)',
    gradientTo: 'rgba(111, 92, 214, 0.02)',
  },
  supertonic: {
    title: 'Supertonic',
    tagline: 'First audio in ~1s. Uses more RAM. May occasionally drop words.',
    sizeMb: 265,
    ramMb: 428,
    voices: 10,
    tier: 'fastest start',
    accent: '#1E4DF6',
    gradientFrom: 'rgba(30, 77, 246, 0.14)',
    gradientTo: 'rgba(30, 77, 246, 0.02)',
  },
  system: {
    title: Platform.OS === 'ios' ? 'iOS Voices' : 'Android Voices',
    tagline: 'Built into your device. Always available, offline.',
    sizeMb: 0,
    ramMb: 0,
    voices: 0,
    tier: 'native',
    accent: '#7B8896',
    gradientFrom: 'rgba(123, 136, 150, 0.10)',
    gradientTo: 'rgba(123, 136, 150, 0.02)',
  },
};
