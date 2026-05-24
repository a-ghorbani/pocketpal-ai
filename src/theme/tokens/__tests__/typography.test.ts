/**
 * Tests for the design-token typography surface.
 *
 * Locale-aware resolution scenarios:
 *   - Headline renders in Fraunces for Latin locales.
 *   - Headline falls back to Inter for non-Latin locales.
 *   - JetBrains Mono is locale-agnostic (no swap for code blocks).
 */
import type {AvailableLanguage} from '../../../locales';

import {
  FONT_FAMILIES,
  NON_LATIN_LOCALES,
  resolveTokens,
  typography,
  typographyForLocale,
} from '../index';

describe('typography tokens', () => {
  describe('absolute line-heights', () => {
    it('headlineH1 has lineHeight resolved to absolute px (36 × 1.4 = 50)', () => {
      expect(typography.headlineH1).toMatchObject({
        fontFamily: FONT_FAMILIES.FRAUNCES_REGULAR,
        fontSize: 36,
        lineHeight: 50,
        fontWeight: '400',
      });
    });

    it('styledXs has lineHeight === fontSize (100% multiplier resolved)', () => {
      expect(typography.styledXs.lineHeight).toBe(typography.styledXs.fontSize);
      expect(typography.styledXs.fontFamily).toBe(
        FONT_FAMILIES.FRAUNCES_ITALIC,
      );
      expect(typography.styledXs.fontStyle).toBe('italic');
    });

    it('every typography token has a numeric absolute lineHeight', () => {
      for (const key of Object.keys(typography) as Array<
        keyof typeof typography
      >) {
        const style = typography[key];
        expect(typeof style.lineHeight).toBe('number');
        expect(Number.isFinite(style.lineHeight)).toBe(true);
      }
    });
  });

  describe('Latin locales render Fraunces', () => {
    const latinLocales: AvailableLanguage[] = ['en', 'id', 'ms'];

    it.each(latinLocales)(
      'headlineH1 in %s resolves to Fraunces-Regular at 36 / 50',
      locale => {
        const resolved = typographyForLocale('headlineH1', locale);
        expect(resolved.fontFamily).toBe(FONT_FAMILIES.FRAUNCES_REGULAR);
        expect(resolved.fontSize).toBe(36);
        expect(resolved.lineHeight).toBe(50);
        expect(resolved.fontWeight).toBe('400');
      },
    );

    it('styledXs in en resolves to Fraunces-Italic', () => {
      const resolved = typographyForLocale('styledXs', 'en');
      expect(resolved.fontFamily).toBe(FONT_FAMILIES.FRAUNCES_ITALIC);
      expect(resolved.fontStyle).toBe('italic');
    });
  });

  describe('non-Latin locales fall back to Inter', () => {
    it.each(NON_LATIN_LOCALES)(
      'headlineH1 in %s falls back to Inter-Regular at 36 / 50',
      locale => {
        const resolved = typographyForLocale('headlineH1', locale);
        expect(resolved.fontFamily).toBe(FONT_FAMILIES.INTER_REGULAR);
        expect(resolved.fontSize).toBe(36);
        expect(resolved.lineHeight).toBe(50);
        expect(resolved.fontWeight).toBe('400');
      },
    );

    it.each(NON_LATIN_LOCALES)(
      'styledXs in %s falls back to Inter-Medium with synthesised italic',
      locale => {
        const resolved = typographyForLocale('styledXs', locale);
        expect(resolved.fontFamily).toBe(FONT_FAMILIES.INTER_MEDIUM);
        expect(resolved.fontStyle).toBe('italic');
        expect(resolved.fontSize).toBe(typography.styledXs.fontSize);
        expect(resolved.lineHeight).toBe(typography.styledXs.lineHeight);
      },
    );
  });

  describe('JetBrains Mono is locale-agnostic', () => {
    it.each(NON_LATIN_LOCALES)(
      'codeM in %s remains JetBrainsMono-Regular',
      locale => {
        const resolved = typographyForLocale('codeM', locale);
        expect(resolved.fontFamily).toBe(FONT_FAMILIES.JETBRAINS_MONO_REGULAR);
      },
    );

    it('codeS in en is JetBrainsMono-Regular', () => {
      const resolved = typographyForLocale('codeS', 'en');
      expect(resolved.fontFamily).toBe(FONT_FAMILIES.JETBRAINS_MONO_REGULAR);
    });

    it.each(['en', ...NON_LATIN_LOCALES] as AvailableLanguage[])(
      'bodyM (Inter) in %s is unchanged',
      locale => {
        const resolved = typographyForLocale('bodyM', locale);
        expect(resolved.fontFamily).toBe(FONT_FAMILIES.INTER_REGULAR);
      },
    );
  });

  describe('mode resolution', () => {
    it('resolveTokens("light") returns lightColors bound', () => {
      const t = resolveTokens('light');
      expect(t.colors.background).toBe('#ffffff');
    });

    it('resolveTokens("dark") returns darkColors bound', () => {
      const t = resolveTokens('dark');
      expect(t.colors.background).toBe('#000000');
    });

    it('typography binding is shared across modes (locale swap is in builder)', () => {
      const l = resolveTokens('light');
      const d = resolveTokens('dark');
      expect(l.typography).toBe(d.typography);
    });
  });
});
