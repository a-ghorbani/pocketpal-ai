/**
 * Spacing tokens. Single scale. Canonical Figma `Spacing/*`.
 * `Gap/*` aliases resolve to this scale (Gap/S → spacing.s,
 * Gap/SM → spacing.sm). Consumers see only this surface.
 */
import {TokenSpacing} from './types';

export const spacing: TokenSpacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  s: 8,
  sm: 12,
  m: 16,
  ml: 20,
  l: 24,
};
