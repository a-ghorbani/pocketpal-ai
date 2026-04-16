import React from 'react';
import Svg, {Defs, RadialGradient, Stop, Circle} from 'react-native-svg';

import type {EngineId, Voice} from '../../services/tts';

type Character = NonNullable<Voice['character']>;

// Engine-keyed palette is the primary source of truth — visually pairs
// the avatar with the engine card / hero strip. Character palette kept as
// a fallback for legacy callers.
const ENGINE_STOPS: Record<EngineId, [string, string, string]> = {
  kitten: ['#FFD5B3', '#F29547', '#B8531A'],
  kokoro: ['#C0BAEF', '#6F5CD6', '#3A2D8A'],
  supertonic: ['#A4C5FF', '#1E4DF6', '#0B2A8C'],
  system: ['#D7DCE3', '#7B8896', '#3D4651'],
};

const CHARACTER_STOPS: Record<Character, [string, string, string]> = {
  warm: ['#FFD5B3', '#F29547', '#B8531A'],
  clear: ['#C3DCEB', '#46A1D1', '#1F5E8A'],
  deep: ['#A8A4E3', '#6F5CD6', '#3A2D8A'],
  bright: ['#FFE79A', '#49CBA8', '#176652'],
};

const hash = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
};

interface VoiceAvatarProps {
  voice: Pick<Voice, 'id' | 'engine' | 'character'> & {character?: Character};
  size?: number;
  ringColor?: string;
}

/**
 * Deterministic soft gradient blob used as a voice's visual identity.
 * Character → base palette, voice id → seed for focal-point offset so
 * voices inside the same character group still look distinct.
 */
export const VoiceAvatar: React.FC<VoiceAvatarProps> = ({
  voice,
  size = 40,
  ringColor,
}) => {
  const [stopA, stopB, stopC] = ENGINE_STOPS[voice.engine];

  const seed = hash(voice.id);
  const cx = 30 + (seed % 40);
  const cy = 30 + ((seed >> 3) % 40);
  const r = 70 + ((seed >> 6) % 20);

  const gradId = `g-${voice.engine}-${voice.id}`;
  const ringWidth = ringColor ? 2 : 0;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient
          id={gradId}
          cx={cx}
          cy={cy}
          rx={r}
          ry={r}
          fx={cx}
          fy={cy}>
          <Stop offset="0%" stopColor={stopA} stopOpacity={1} />
          <Stop offset="55%" stopColor={stopB} stopOpacity={1} />
          <Stop offset="100%" stopColor={stopC} stopOpacity={1} />
        </RadialGradient>
      </Defs>
      <Circle
        cx={50}
        cy={50}
        r={50 - ringWidth}
        fill={`url(#${gradId})`}
        stroke={ringColor}
        strokeWidth={ringWidth}
      />
    </Svg>
  );
};

export const getEngineAccent = (engine: EngineId): string =>
  ENGINE_STOPS[engine][1];

export const getEngineTint = (engine: EngineId, opacity: number): string => {
  const hex = getEngineAccent(engine).replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

// Legacy character helpers — kept until all callers retire.
export const getCharacterAccent = (character?: Character): string => {
  const key: Character = character ?? 'clear';
  return CHARACTER_STOPS[key][1];
};

export const getCharacterTint = (
  character: Character | undefined,
  opacity: number,
): string => {
  const hex = getCharacterAccent(character).replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};
