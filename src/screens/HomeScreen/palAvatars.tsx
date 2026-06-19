import React from 'react';
import Svg, {Circle, G, Path, Rect} from 'react-native-svg';

import {useTheme} from '../../hooks';
import type {Pal} from '../../types/pal';

// Default-pal mascot art. The default pals ship as bare color tiles; the
// canonical Home renders illustrated characters in the carousel + history
// avatars. We map a default pal (identified by its stable name) to a
// full-bleed mascot that fills the rounded-rect avatar card — the card's own
// radius / shadow / active border frame it, so the art carries no border.
//
// Pip art is ported from the onboarding mascot (Figma `887:30085`). Lookie has
// no art asset yet, so it falls back to its color tile.

const PIP_BG = '#CED5D3'; // Color/green/subtle

/**
 * Full-bleed Pip mascot face — a green-subtle field with two eye dots, an
 * eyebrow arc, and a "ping" notch. Stretches to fill its parent (the avatar
 * card's inner visuals), so the card supplies the rounding and frame.
 */
const PipAvatar: React.FC = () => {
  const theme = useTheme();
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 66 62"
      preserveAspectRatio="xMidYMid slice">
      <Rect x={0} y={0} width={66} height={62} fill={PIP_BG} />
      <G>
        <Circle cx={26.3} cy={31} r={3.3} fill={theme.colors.onBackground} />
        <Circle cx={39.7} cy={31} r={3.3} fill={theme.colors.onBackground} />
        <Path
          d="M 20 16 Q 23 12 28 14"
          stroke={theme.colors.onBackground}
          strokeWidth={1.4}
          fill="none"
          strokeLinecap="round"
        />
        <Rect
          x={(66 - 5) / 2}
          y={38.6}
          width={5}
          height={2.7}
          rx={1.4}
          ry={1.4}
          fill={theme.colors.onBackground}
        />
      </G>
    </Svg>
  );
};

/**
 * Resolves a default pal to its mascot art. Returns null for pals without a
 * bundled illustration (the caller then renders the pal's color tile / image).
 */
export const palAvatarArt = (pal: Pal): React.ReactNode => {
  if (pal.source === 'local' && pal.name === 'Pip') {
    return <PipAvatar />;
  }
  return null;
};
