/**
 * Design tokens entry point (Phase 1).
 *
 * Pure data + types. No React, no Paper, no MobX imports here. The only
 * runtime dependency is `colorUtils` (pure utility — not React/Paper/MobX).
 *
 * Mode is selected by binding (light vs dark), not by mutation. Locale
 * fallback (Fraunces → Inter for non-Latin scripts) lives in the theme
 * builder (`useTheme()`) so components remain locale-agnostic.
 */
import {lightColors, darkColors} from './colors';
import {radius} from './radius';
import {spacing} from './spacing';
import {stroke} from './stroke';
import {typography} from './typography';

import type {Mode, Tokens} from './types';

export const lightTokens: Tokens = {
  colors: lightColors,
  typography,
  spacing,
  radius,
  stroke,
};

export const darkTokens: Tokens = {
  colors: darkColors,
  typography,
  spacing,
  radius,
  stroke,
};

/**
 * Returns the resolved Tokens for a given mode. The returned object is a
 * stable per-module reference — do not mutate.
 */
export function resolveTokens(mode: Mode): Tokens {
  return mode === 'dark' ? darkTokens : lightTokens;
}

export type {
  Mode,
  Tokens,
  TokenColors,
  TokenTypography,
  TokenSpacing,
  TokenRadius,
  TokenStroke,
  TypographyStyle,
} from './types';

export {
  FONT_FAMILIES,
  NON_LATIN_LOCALES,
  typography,
  typographyForLocale,
  resolveTypographyForLocale,
} from './typography';

export {lightColors, darkColors} from './colors';
export {spacing} from './spacing';
export {radius} from './radius';
export {stroke} from './stroke';
