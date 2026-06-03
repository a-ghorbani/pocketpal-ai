import type {EngineId} from '../../services/tts';

/**
 * Per-engine numeric/visual metadata used across the sheet for branding,
 * spec strips and group headers. Single source of truth — extend here
 * when adding a new engine.
 *
 * Localized strings (title, tagline, tier label) live in
 * `voiceAndSpeech.engine*` keys in en.json — look them up at the call
 * site so translators can localize without touching this table.
 *
 * RAM comes from on-device benchmarks (FOU-47, iPhone 13 Pro, Release,
 * 152-char prompt). Numbers are approximate peak resident MB during
 * inference, not disk footprint.
 */
export interface EngineMeta {
  /** ~MB on disk after install (0 for system). */
  sizeMb: number;
  /** ~Peak RAM during synthesis, MB (0 for system / unknown). */
  ramMb: number;
  /** Voice count for spec strip. */
  voices: number;
  accent: string;
  gradientFrom: string;
  gradientTo: string;
}

export const ENGINE_META: Record<EngineId, EngineMeta> = {
  kitten: {
    sizeMb: 57,
    ramMb: 235,
    voices: 8,
    accent: '#F29547',
    gradientFrom: 'rgba(242, 149, 71, 0.12)',
    gradientTo: 'rgba(242, 149, 71, 0.02)',
  },
  kokoro: {
    sizeMb: 330,
    ramMb: 1000,
    voices: 22,
    accent: '#6F5CD6',
    gradientFrom: 'rgba(111, 92, 214, 0.14)',
    gradientTo: 'rgba(111, 92, 214, 0.02)',
  },
  supertonic: {
    sizeMb: 265,
    ramMb: 428,
    voices: 10,
    accent: '#1E4DF6',
    gradientFrom: 'rgba(30, 77, 246, 0.14)',
    gradientTo: 'rgba(30, 77, 246, 0.02)',
  },
  system: {
    sizeMb: 0,
    ramMb: 0,
    voices: 0,
    accent: '#7B8896',
    gradientFrom: 'rgba(123, 136, 150, 0.10)',
    gradientTo: 'rgba(123, 136, 150, 0.02)',
  },
};
