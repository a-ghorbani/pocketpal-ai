/**
 * Typography tokens — the new design-system surface.
 *
 * Base (Latin) values. Locale-aware swapping (Fraunces → Inter for
 * non-Latin) is implemented by `typographyForLocale()` and invoked from
 * the theme builder. Components remain locale-agnostic.
 *
 * Invariants enforced here:
 *   - Absolute px line-heights only (no multipliers, no '%' strings).
 *     Two known canonical-file offenders resolved:
 *       * Headline/H1: 36 × 1.4 multiplier → lineHeight: 50.
 *       * Styled/xs:  100% multiplier      → lineHeight === fontSize.
 *   - Static weight mapping: weight '400' → '*-Regular' family,
 *     weight '500' → '*-Medium' family. No variable-axis weights.
 *   - Every fontFamily string here must match a bundled font asset
 *     (PostScript name on iOS, filename sans .ttf on Android). Enforced
 *     by scripts/verify-fonts.js + CI.
 */
import {type AvailableLanguage} from '../../locales';

import {TokenTypography, TypographyStyle} from './types';

// Family-name constants. Match the PostScript names of the bundled TTFs.
export const FONT_FAMILIES = {
  INTER_REGULAR: 'Inter-Regular',
  INTER_MEDIUM: 'Inter-Medium',
  FRAUNCES_REGULAR: 'Fraunces-Regular',
  FRAUNCES_MEDIUM: 'Fraunces-Medium',
  FRAUNCES_ITALIC: 'Fraunces-Italic',
  FRAUNCES_MEDIUM_ITALIC: 'Fraunces-MediumItalic',
  JETBRAINS_MONO_REGULAR: 'JetBrainsMono-Regular',
  JETBRAINS_MONO_MEDIUM: 'JetBrainsMono-Medium',
} as const;

/**
 * Locales whose primary script falls outside Inter's Latin + Cyrillic
 * coverage and outside Fraunces's design intent. For these, Fraunces
 * tokens fall back to Inter. Cyrillic locales (ru, uk) are Latin
 * script-set and NOT in this list. Latin locales (id, ms, en) are not
 * in this list either.
 */
export const NON_LATIN_LOCALES: ReadonlyArray<AvailableLanguage> = [
  'fa',
  'he',
  'ja',
  'ko',
  'zh',
  'zh_Hant',
];

const isNonLatinLocale = (locale: AvailableLanguage): boolean =>
  NON_LATIN_LOCALES.includes(locale);

/**
 * Base typography tokens. Values mirror the canonical Figma file
 * (`RZxDJea4t6jnBZrV4YBacF`, design system at `789:19792`). All
 * line-heights are absolute pixel values.
 *
 * No consumer references these in this slice — the new surface coexists
 * with the legacy `theme.fonts.*` MD3 typescale (preserved verbatim by
 * the builder to avoid visual regression). Future restyle slices
 * migrate per screen.
 */
export const typography: TokenTypography = {
  // Body (Inter)
  bodyM: {
    fontFamily: FONT_FAMILIES.INTER_REGULAR,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
  },
  bodyS: {
    fontFamily: FONT_FAMILIES.INTER_REGULAR,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
  },

  // UI (Inter, medium)
  uiM: {
    fontFamily: FONT_FAMILIES.INTER_MEDIUM,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  uiS: {
    fontFamily: FONT_FAMILIES.INTER_MEDIUM,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },

  // Title (Inter, medium)
  titleL: {
    fontFamily: FONT_FAMILIES.INTER_MEDIUM,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '500',
  },
  titleM: {
    fontFamily: FONT_FAMILIES.INTER_MEDIUM,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '500',
  },
  titleS: {
    fontFamily: FONT_FAMILIES.INTER_MEDIUM,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
  },

  // Caption (Inter)
  captionM: {
    fontFamily: FONT_FAMILIES.INTER_REGULAR,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
  },
  captionS: {
    fontFamily: FONT_FAMILIES.INTER_REGULAR,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '400',
  },

  // Headlines (Fraunces — Latin/Cyrillic only; non-Latin locales swap to
  // Inter via `typographyForLocale`)
  headlineH1: {
    fontFamily: FONT_FAMILIES.FRAUNCES_REGULAR,
    fontSize: 36,
    // 36 × 1.4 = 50.4 → 50 (absolute px; canonical multiplier resolved)
    lineHeight: 50,
    fontWeight: '400',
  },

  // Accent italic (Fraunces italic). lineHeight === fontSize per the
  // canonical Styled/xs "100%" multiplier (resolved to absolute px).
  styledXs: {
    fontFamily: FONT_FAMILIES.FRAUNCES_ITALIC,
    fontSize: 14,
    lineHeight: 14,
    fontWeight: '400',
    fontStyle: 'italic',
  },

  // Code (JetBrains Mono — locale-agnostic)
  codeM: {
    fontFamily: FONT_FAMILIES.JETBRAINS_MONO_REGULAR,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
  },
  codeS: {
    fontFamily: FONT_FAMILIES.JETBRAINS_MONO_REGULAR,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
  },
};

/**
 * Resolve a typography style for a given (style, locale) pair. Fallback
 * rule:
 *   - Fraunces upright + non-Latin locale → Inter (same weight class).
 *   - Fraunces italic  + non-Latin locale → Inter-Medium with
 *     `fontStyle: 'italic'` (synthesised italic — no Inter-Italic cut
 *     bundled).
 *   - Inter / JetBrains Mono → no swap (Inter covers Latin + Cyrillic;
 *     code is locale-agnostic).
 *
 * Invoked from the theme builder — components never call this directly,
 * so components remain locale-agnostic.
 */
export function typographyForLocale(
  style: keyof TokenTypography,
  locale: AvailableLanguage,
): TypographyStyle {
  const base = typography[style];
  if (!isNonLatinLocale(locale)) {
    return base;
  }
  switch (base.fontFamily) {
    case FONT_FAMILIES.FRAUNCES_REGULAR:
      return {...base, fontFamily: FONT_FAMILIES.INTER_REGULAR};
    case FONT_FAMILIES.FRAUNCES_MEDIUM:
      return {...base, fontFamily: FONT_FAMILIES.INTER_MEDIUM};
    case FONT_FAMILIES.FRAUNCES_ITALIC:
    case FONT_FAMILIES.FRAUNCES_MEDIUM_ITALIC:
      // Synthesised italic on Inter rather than shipping Inter-Italic
      // cuts (~200KB per cut for an accent-only style).
      return {
        ...base,
        fontFamily: FONT_FAMILIES.INTER_MEDIUM,
        fontStyle: 'italic',
      };
    default:
      // Inter family and JetBrains Mono — no swap.
      return base;
  }
}

/**
 * Build a locale-aware typography binding by running every key through
 * `typographyForLocale`. Used by the theme builder.
 */
export function resolveTypographyForLocale(
  locale: AvailableLanguage,
): TokenTypography {
  return (Object.keys(typography) as Array<keyof TokenTypography>).reduce(
    (acc, key) => {
      acc[key] = typographyForLocale(key, locale);
      return acc;
    },
    {} as TokenTypography,
  );
}
