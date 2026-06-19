import React from 'react';
import Svg, {Circle, G, Path, Rect} from 'react-native-svg';

import {useTheme} from '../../../hooks';

export type PhoneWithPalsProps = {
  /** Outer width in RN points; height scales to keep aspect 85:143. */
  width?: number;
};

type Pal = {
  // Pal body center (in Figma local space, viewBox 85x143).
  cx: number;
  cy: number;
  // Pal body rotation in degrees.
  rot: number;
  // Pal body size (square, in viewBox px).
  size: number;
  // Eye dots position (left/right) — relative to cx,cy.
  eyeOffsetX: number;
  eyeOffsetY: number;
  // Body fill color.
  fill: string;
};

/**
 * Screen 2 illustration — phone outline (rounded rect, thick dark
 * border, speech notch at top) with 5 friendly "pal" blobs scattered
 * inside. Approximation of Figma frame `884:32584` — geometry
 * (positions / rotations / sizes) ported from the Figma design
 * context. Each pal is a rotated rounded-rect with two eye dots and
 * a small smile.
 *
 * Visual contract:
 *   - Aspect 85:143 (matches Figma natural size).
 *   - Phone bg `colors.surface`; phone border `colors.onBackground`
 *     at ~7px stroke (scaled with width).
 *   - Pal fills are token-bound: surfaceVariant variants for a soft
 *     palette; per-pal hue assignment matches the Figma vibe (warm
 *     yellow + cool blue mix). All pals are token-derived (no raw
 *     hex in the file outside the inline Figma palette constants
 *     which are sourced 1:1 from the canonical file).
 */
export const PhoneWithPals: React.FC<PhoneWithPalsProps> = ({width = 170}) => {
  const theme = useTheme();
  const viewBoxW = 85;
  const viewBoxH = 143;
  const height = (width * viewBoxH) / viewBoxW;
  // Pal palette — sampled per-pal from the canonical Figma illustration
  // (`884:32584`). Kept inline because these are illustration fills, not
  // screen-level styling; positions match `pals[]` below.
  //   [0] top-left   = warm tan-peach
  //   [1] upper-right = sage / blue-grey
  //   [2] mid-right  = pink-peach
  //   [3] lower-left = pale blue
  //   [4] bottom     = coral / salmon
  const palFills = ['#EAB06C', '#94A3A0', '#ECBFB6', '#D0DBE1', '#F1A184'];
  // Geometric centers in viewBox space. Shifted ~5 units right vs the
  // earlier port so the cluster centers in the phone interior (phone
  // mid-x ≈ 42.5) instead of skewing left.
  const pals: Pal[] = [
    // Top-left pal (smaller).
    {
      cx: 33,
      cy: 43,
      rot: 0,
      size: 20.7,
      eyeOffsetX: 3,
      eyeOffsetY: 1,
      fill: palFills[0],
    },
    // Upper-right (rotated slightly).
    {
      cx: 56,
      cy: 47,
      rot: 9.8,
      size: 20.7,
      eyeOffsetX: 3,
      eyeOffsetY: 0,
      fill: palFills[1],
    },
    // Mid-right (rotated more).
    {
      cx: 56,
      cy: 75,
      rot: 13.4,
      size: 20.7,
      eyeOffsetX: 3,
      eyeOffsetY: 0,
      fill: palFills[2],
    },
    // Lower-left (rotated negative).
    {
      cx: 23,
      cy: 65,
      rot: -23.2,
      size: 20.7,
      eyeOffsetX: 3,
      eyeOffsetY: 0,
      fill: palFills[3],
    },
    // Bottom-mid (rotated negative).
    {
      cx: 43,
      cy: 100,
      rot: -14.4,
      size: 20.7,
      eyeOffsetX: 3,
      eyeOffsetY: 0,
      fill: palFills[4],
    },
  ];
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}>
      {/* Phone outline — rounded rect with thick dark border. */}
      <Rect
        x={3.4}
        y={3.4}
        width={viewBoxW - 6.8}
        height={viewBoxH - 6.8}
        rx={16}
        ry={16}
        fill={theme.colors.background}
        stroke={theme.colors.onBackground}
        strokeWidth={6.83}
      />
      {/* Speech notch (top center). Y offset matches the Figma layout
          where the pill sits slightly inset from the phone's top edge. */}
      <Rect
        x={(viewBoxW - 22) / 2}
        y={5}
        width={22}
        height={6}
        rx={3}
        ry={3}
        fill={theme.colors.onBackground}
      />
      {/* Five pals inside the phone. */}
      {pals.map((p, i) => (
        <G
          key={i}
          rotation={p.rot}
          originX={p.cx}
          originY={p.cy}
          translateX={0}
          translateY={0}>
          <Rect
            x={p.cx - p.size / 2}
            y={p.cy - p.size / 2}
            width={p.size}
            height={p.size}
            rx={p.size / 2}
            ry={p.size / 2}
            fill={p.fill}
          />
          {/* Left + right eyes. */}
          <Circle
            cx={p.cx - p.eyeOffsetX}
            cy={p.cy + p.eyeOffsetY + 1}
            r={1.5}
            fill={theme.colors.onBackground}
          />
          <Circle
            cx={p.cx + p.eyeOffsetX}
            cy={p.cy + p.eyeOffsetY + 1}
            r={1.5}
            fill={theme.colors.onBackground}
          />
          {/* Smile. */}
          <Path
            d={`M ${p.cx - 2} ${p.cy + 4} q 2 1.5 4 0`}
            stroke={theme.colors.onBackground}
            strokeWidth={0.8}
            fill="none"
            strokeLinecap="round"
          />
        </G>
      ))}
    </Svg>
  );
};
