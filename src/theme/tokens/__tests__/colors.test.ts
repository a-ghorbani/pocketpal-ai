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
});
