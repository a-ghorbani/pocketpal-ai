import React from 'react';
import Svg, {Defs, RadialGradient, Stop, Circle} from 'react-native-svg';

import type {EngineId, Voice} from '../../services/tts';

const ENGINE_STOPS: Record<EngineId, [string, string, string]> = {
  kitten: ['#FFD5B3', '#F29547', '#B8531A'],
  kokoro: ['#C0BAEF', '#6F5CD6', '#3A2D8A'],
  supertonic: ['#A4C5FF', '#1E4DF6', '#0B2A8C'],
  system: ['#D7DCE3', '#7B8896', '#3D4651'],
};

const hash = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i); // eslint-disable-line no-bitwise
    h |= 0; // eslint-disable-line no-bitwise
  }
  return Math.abs(h);
};

interface VoiceAvatarProps {
  voice: Pick<Voice, 'id' | 'engine'>;
  size?: number;
}

/**
 * Deterministic soft gradient blob used as a voice's visual identity.
 * Engine → base palette, voice id → seed for focal-point offset so
 * voices inside the same engine still look distinct.
 */
export const VoiceAvatar: React.FC<VoiceAvatarProps> = ({voice, size = 40}) => {
  const [stopA, stopB, stopC] = ENGINE_STOPS[voice.engine];

  const seed = hash(voice.id);
  const cx = 30 + (seed % 40);
  const cy = 30 + ((seed >> 3) % 40); // eslint-disable-line no-bitwise
  const r = 70 + ((seed >> 6) % 20); // eslint-disable-line no-bitwise

  const gradId = `g-${voice.engine}-${voice.id}`;

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
      <Circle cx={50} cy={50} r={50} fill={`url(#${gradId})`} />
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
