/**
 * Radius tokens. Single scale. Key names mirror canonical Figma
 * `Radius/*` (None/XXS/XS/S/M/ML/L/XL/XXL) so a Figma spec saying
 * `Radius/L` maps directly to `radius.l`. There is no `sm` step —
 * Figma jumps S(8) → M(12). The legacy lowercase `radius/radius-xs`
 * (= 4) alias resolves to `xs` here.
 */
import {TokenRadius} from './types';

export const radius: TokenRadius = {
  none: 0,
  xxs: 2,
  xs: 4,
  s: 8,
  m: 12,
  ml: 16,
  l: 20,
  xl: 32,
  xxl: 40,
};
