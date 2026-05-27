import React from 'react';
import Svg, {Rect} from 'react-native-svg';

import {ShieldGlyph} from '../../../assets/onboarding/illustrations';
import {useTheme} from '../../../hooks';

export type PhoneWithShieldProps = {
  /** Outer width in RN points; height scales to keep aspect 85:143. */
  width?: number;
};

/**
 * Screen 4 illustration — phone outline (rounded rect, thick dark
 * border, speech notch at top) with a privacy shield glyph centered
 * inside. Approximation of Figma frame `885:29601`. Phone outline +
 * notch are tokenised; shield glyph is the flat SVG exported from
 * Figma (`885:29695`).
 */
export const PhoneWithShield: React.FC<PhoneWithShieldProps> = ({
  width = 170,
}) => {
  const theme = useTheme();
  const viewBoxW = 85;
  const viewBoxH = 143;
  const height = (width * viewBoxH) / viewBoxW;
  const shieldSize = (41 / viewBoxW) * width;
  return (
    <>
      <Svg
        width={width}
        height={height}
        viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}>
        <Rect
          x={3.4}
          y={3.4}
          width={viewBoxW - 6.8}
          height={viewBoxH - 6.8}
          rx={16}
          ry={16}
          fill={theme.colors.surface}
          stroke={theme.colors.onBackground}
          strokeWidth={6.83}
        />
        <Rect
          x={(viewBoxW - 22) / 2}
          y={2.3}
          width={22}
          height={6}
          rx={3}
          ry={3}
          fill={theme.colors.onBackground}
        />
      </Svg>
      <ShieldGlyph
        width={shieldSize}
        height={shieldSize}
        style={{
          position: 'absolute',
          top: (49.8 / viewBoxH) * height,
          left: (width - shieldSize) / 2,
        }}
      />
    </>
  );
};
