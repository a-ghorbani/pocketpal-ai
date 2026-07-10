import React from 'react';
import Svg, {Circle, G, Path, Rect} from 'react-native-svg';

import {useTheme} from '../../../hooks';

export type PipMascotProps = {
  /** Outer width in RN points; height scales to keep aspect 66:62. */
  width?: number;
};

// Figma palette — sourced verbatim from the canonical file for the
// recommended-pal mascot at `887:30085`.
const MASCOT_BG = '#CED5D3'; // Color/green/subtle
const MASCOT_BORDER = '#FAFAFA'; // Color/primary/foreground

/**
 * Screen 6 illustration — the recommended-pal "Pip" mascot. A
 * 66×62 rounded card (green-subtle bg, 3px white border) with a
 * friendly cartoon face inside: two black eye dots, a curved
 * eyebrow stroke, and a tiny "ping" speech notch at the bottom.
 * Ported from Figma `887:30085`.
 */
export const PipMascot: React.FC<PipMascotProps> = ({width = 66}) => {
  const theme = useTheme();
  const viewBoxW = 66;
  const viewBoxH = 62;
  const height = (width * viewBoxH) / viewBoxW;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}>
      {/* Mascot card. */}
      <Rect
        x={1.5}
        y={1.5}
        width={viewBoxW - 3}
        height={viewBoxH - 3}
        rx={18}
        ry={18}
        fill={MASCOT_BG}
        stroke={MASCOT_BORDER}
        strokeWidth={3}
      />
      <G>
        {/* Eyes — two black dots, centered horizontally with a 13px gap. */}
        <Circle cx={26.3} cy={31} r={3.3} fill={theme.colors.onBackground} />
        <Circle cx={39.7} cy={31} r={3.3} fill={theme.colors.onBackground} />
        {/* Eyebrow arc (left brow tilted). */}
        <Path
          d="M 20 16 Q 23 12 28 14"
          stroke={theme.colors.onBackground}
          strokeWidth={1.4}
          fill="none"
          strokeLinecap="round"
        />
        {/* Ping / speech dot at the bottom. */}
        <Rect
          x={(viewBoxW - 5) / 2}
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
