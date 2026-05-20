/**
 * Tests for the design-token scales.
 *
 * Verifies the "single scale per dimension" rule: the canonical Figma
 * file lists `Gap/*` and lowercase `radius/radius-xs` as legacy names
 * that mirror `Spacing/*` / `Radius/XS`. The token module resolves those
 * aliases at module level — consumers see ONE scale per dimension. The
 * surfaced spacing / radius / stroke objects must not contain any alias
 * keys (`gap*`, `radius-xs`, `Gap/*`, etc.).
 *
 * Also covers the canonical value sets:
 *   spacing: 0/2/4/8/12/16/20/24 (none/xxs/xs/s/sm/m/ml/l)
 *   radius : 0/2/4/8/12/16/20/32/40 (none/xxs/xs/s/sm/m/ml/l/xl)
 *   stroke : 0.5/1/1.5/3 (hairline/s/m/l)
 */
import {radius, spacing, stroke} from '../index';

describe('design-token scales — single scale per dimension', () => {
  describe('spacing', () => {
    // The exact, canonical key set. Any drift (a `Gap/*` alias leaking
    // through, an extra key, a renamed key) fails this assertion.
    const expectedKeys = [
      'none',
      'xxs',
      'xs',
      's',
      'sm',
      'm',
      'ml',
      'l',
    ] as const;

    it('exposes exactly the canonical scale keys (no Gap/* aliases)', () => {
      expect(Object.keys(spacing).sort()).toEqual([...expectedKeys].sort());
    });

    it('values match the canonical scale (0/2/4/8/12/16/20/24)', () => {
      expect(spacing).toEqual({
        none: 0,
        xxs: 2,
        xs: 4,
        s: 8,
        sm: 12,
        m: 16,
        ml: 20,
        l: 24,
      });
    });

    it('contains no alias keys (gap*, Gap/*, etc.)', () => {
      for (const key of Object.keys(spacing)) {
        expect(key.toLowerCase()).not.toMatch(/^gap/);
        expect(key).not.toContain('/');
      }
    });

    // Documented aliasing: Gap/S=8 mirrors Spacing/S=8; Gap/SM=12
    // mirrors Spacing/SM=12 (residual canonical-file name-drift). The
    // token module resolves these at source — `spacing.s` and
    // `spacing.sm` are the canonical lookups.
    it('Gap/S alias resolves to spacing.s (=8)', () => {
      expect(spacing.s).toBe(8);
    });

    it('Gap/SM alias resolves to spacing.sm (=12)', () => {
      expect(spacing.sm).toBe(12);
    });
  });

  describe('radius', () => {
    const expectedKeys = [
      'none',
      'xxs',
      'xs',
      's',
      'sm',
      'm',
      'ml',
      'l',
      'xl',
    ] as const;

    it('exposes exactly the canonical scale keys (no radius-xs alias)', () => {
      expect(Object.keys(radius).sort()).toEqual([...expectedKeys].sort());
    });

    it('values match the canonical scale (0/2/4/8/12/16/20/32/40)', () => {
      expect(radius).toEqual({
        none: 0,
        xxs: 2,
        xs: 4,
        s: 8,
        sm: 12,
        m: 16,
        ml: 20,
        l: 32,
        xl: 40,
      });
    });

    it('contains no alias keys (radius-xs, kebab-case)', () => {
      for (const key of Object.keys(radius)) {
        expect(key).not.toContain('-');
        expect(key).not.toContain('/');
      }
    });

    // Documented aliasing: lowercase `radius/radius-xs` = 4 mirrors
    // `Radius/XS` = 4. The canonical lookup is `radius.xs`.
    it('radius/radius-xs alias resolves to radius.xs (=4)', () => {
      expect(radius.xs).toBe(4);
    });
  });

  describe('stroke', () => {
    const expectedKeys = ['hairline', 's', 'm', 'l'] as const;

    it('exposes exactly the canonical scale keys', () => {
      expect(Object.keys(stroke).sort()).toEqual([...expectedKeys].sort());
    });

    it('values match the canonical scale (0.5/1/1.5/3)', () => {
      expect(stroke).toEqual({
        hairline: 0.5,
        s: 1,
        m: 1.5,
        l: 3,
      });
    });
  });
});
