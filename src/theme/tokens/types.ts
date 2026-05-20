/**
 * Design-token types for PocketPal's new design system (Phase 1).
 *
 * Pure data types. No React, no Paper, no MobX imports.
 */
import {TextStyle} from 'react-native';

export type Mode = 'light' | 'dark';

/**
 * Color tokens — every key has a light and dark binding (encoded in the
 * `lightColors` / `darkColors` exports). Names mirror MD3 conventions for
 * the migration layer; semantic / PocketPal-specific extras are appended.
 */
export interface TokenColors {
  // MD3 base palette
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  background: string;
  onBackground: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;

  // MD3 extras
  surfaceDisabled: string;
  onSurfaceDisabled: string;
  inverseSurface: string;
  inverseOnSurface: string;
  inversePrimary: string;
  inverseSecondary: string;
  shadow: string;
  scrim: string;
  backdrop: string;

  // Surface variants (semantic; current dark theme derives via withOpacity)
  surfaceContainerHighest: string;
  surfaceContainerHigh: string;
  surfaceContainer: string;
  surfaceContainerLow: string;
  surfaceContainerLowest: string;
  surfaceDim: string;
  surfaceBright: string;

  // Text
  text: string;
  textSecondary: string;
  inverseText: string;
  inverseTextSecondary: string;

  // Border / placeholder
  border: string;
  placeholder: string;

  // Interactive state opacities (kept under colors for source-compat; will
  // move to a dedicated `interaction` namespace in a later phase)
  stateLayerOpacity: number;
  hoverStateOpacity: number;
  pressedStateOpacity: number;
  draggedStateOpacity: number;
  focusStateOpacity: number;

  // Menu
  menuBackground: string;
  menuBackgroundDimmed: string;
  menuBackgroundActive: string;
  menuSeparator: string;
  menuGroupSeparator: string;
  menuText: string;
  menuDangerText: string;

  // Messages
  authorBubbleBackground: string;
  receivedMessageDocumentIcon: string;
  sentMessageDocumentIcon: string;
  userAvatarImageBackground: string;
  userAvatarNameColors: string[];
  searchBarBackground: string;

  // Thinking bubble
  thinkingBubbleBackground: string;
  thinkingBubbleText: string;
  thinkingBubbleBorder: string;
  thinkingBubbleShadow: string;
  thinkingBubbleChevronBackground: string;
  thinkingBubbleChevronBorder: string;

  // Status bar
  bgStatusActive: string;
  bgStatusIdle: string;

  // Buttons
  btnPrimaryBg: string;
  btnPrimaryBorder: string;
  btnPrimaryText: string;
  btnReadyBg: string;
  btnReadyBorder: string;
  btnReadyText: string;
  btnDownloadBg: string;
  btnDownloadBorder: string;
  btnDownloadText: string;

  // Icons
  iconModelTypeText: string;
  iconModelTypeVision: string;
  iconModelTypeAudio: string;
}

/**
 * A single named typography style ready to spread into a RN TextStyle.
 * Line-heights are absolute pixels (no multipliers or percentage strings).
 * `fontWeight` is the literal weight string RN accepts.
 */
export interface TypographyStyle {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: TextStyle['fontWeight'];
  letterSpacing?: number;
  fontStyle?: TextStyle['fontStyle'];
}

/**
 * Typography tokens — base (Latin) values. Locale-aware swapping happens
 * in the theme builder via `typographyForLocale()`.
 */
export interface TokenTypography {
  bodyM: TypographyStyle;
  bodyS: TypographyStyle;
  uiM: TypographyStyle;
  uiS: TypographyStyle;
  titleL: TypographyStyle;
  titleM: TypographyStyle;
  titleS: TypographyStyle;
  captionM: TypographyStyle;
  captionS: TypographyStyle;
  headlineH1: TypographyStyle;
  styledXs: TypographyStyle;
  codeM: TypographyStyle;
  codeS: TypographyStyle;
}

export interface TokenSpacing {
  none: 0;
  xxs: 2;
  xs: 4;
  s: 8;
  sm: 12;
  m: 16;
  ml: 20;
  l: 24;
}

export interface TokenRadius {
  none: 0;
  xxs: 2;
  xs: 4;
  s: 8;
  sm: 12;
  m: 16;
  ml: 20;
  l: 32;
  xl: 40;
}

export interface TokenStroke {
  hairline: 0.5;
  s: 1;
  m: 1.5;
  l: 3;
}

/**
 * The full set of resolved tokens for a given mode. Mode selection is a
 * binding selection (light vs dark), not a mutation.
 */
export interface Tokens {
  colors: TokenColors;
  typography: TokenTypography;
  spacing: TokenSpacing;
  radius: TokenRadius;
  stroke: TokenStroke;
}
