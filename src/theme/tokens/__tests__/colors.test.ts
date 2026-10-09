/**
 * Color-token spot checks. The full color palette is verified via
 * snapshot tests on consumer components; this file pins the few invariants
 * we cite by name in screen-level contracts.
 */
import {lightColors, darkColors} from '../colors';

describe('design-token colors', () => {
  describe('accent.peach', () => {
    it('is defined for light and dark modes', () => {
      expect(typeof lightColors.accent.peach).toBe('string');
      expect(typeof darkColors.accent.peach).toBe('string');
      expect(lightColors.accent.peach.length).toBeGreaterThan(0);
      expect(darkColors.accent.peach.length).toBeGreaterThan(0);
    });

    it('differs between light and dark', () => {
      expect(lightColors.accent.peach).not.toBe(darkColors.accent.peach);
    });
  });

  describe('statusLoaded', () => {
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map(i => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };

    it.each([
      ['light', lightColors],
      ['dark', darkColors],
    ])('stands out 3:1 against the %s background', (_mode, colors) => {
      expect(
        contrast(colors.statusLoaded, colors.background),
      ).toBeGreaterThanOrEqual(3);
    });
  });
});
