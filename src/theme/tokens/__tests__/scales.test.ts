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
 * Also covers the canonical value sets and the rule that key names mirror
 * Figma so a spec saying `Radius/L` maps to `theme.radius.l`:
 *   spacing: 0/2/4/8/12/16/20/24/32 (none/xxs/xs/s/sm/m/ml/l/xl)
 *   radius : 0/2/4/8/12/16/20/32/40 (none/xxs/xs/s/m/ml/l/xl/xxl)
 *   stroke : 0.5/1/1.5/3            (xs/sm/md/lg)
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
      'xl',
    ] as const;

    it('exposes exactly the canonical scale keys (no Gap/* aliases)', () => {
      expect(Object.keys(spacing).sort()).toEqual([...expectedKeys].sort());
    });

    it('values match the canonical scale (0/2/4/8/12/16/20/24/32)', () => {
      expect(spacing).toEqual({
        none: 0,
        xxs: 2,
        xs: 4,
        s: 8,
        sm: 12,
        m: 16,
        ml: 20,
        l: 24,
        xl: 32,
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
    // Key names mirror canonical Figma `Radius/*`
    // (None/XXS/XS/S/M/ML/L/XL/XXL). Note: there is no `sm` step — Figma
    // jumps S(8) → M(12). A Figma spec saying `Radius/L` must map to
    // `radius.l` (= 20), not `radius.l = 32`.
    const expectedKeys = [
      'none',
      'xxs',
      'xs',
      's',
      'm',
      'ml',
      'l',
      'xl',
      'xxl',
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
        m: 12,
        ml: 16,
        l: 20,
        xl: 32,
        xxl: 40,
      });
    });

    it('contains no alias keys (radius-xs, kebab-case, no `sm` step)', () => {
      for (const key of Object.keys(radius)) {
        expect(key).not.toContain('-');
        expect(key).not.toContain('/');
      }
      // Figma `Radius/*` has no SM step; jumps S(8) → M(12).
      expect(Object.keys(radius)).not.toContain('sm');
    });

    // Documented aliasing: lowercase `radius/radius-xs` = 4 mirrors
    // `Radius/XS` = 4. The canonical lookup is `radius.xs`.
    it('radius/radius-xs alias resolves to radius.xs (=4)', () => {
      expect(radius.xs).toBe(4);
    });

    // Anchor the Figma-name mapping that motivated the renames. If
    // `radius.l` ever returns 32 again, future slices reading `Radius/L`
    // from Figma specs will ship the wrong value.
    it('radius.l matches Figma Radius/L (=20), not the legacy 32', () => {
      expect(radius.l).toBe(20);
    });
  });

  describe('stroke', () => {
    // Key names mirror canonical Figma `Stroke/*` (xs/sm/md/lg).
    const expectedKeys = ['xs', 'sm', 'md', 'lg'] as const;

    it('exposes exactly the canonical scale keys', () => {
      expect(Object.keys(stroke).sort()).toEqual([...expectedKeys].sort());
    });

    it('values match the canonical scale (0.5/1/1.5/3)', () => {
      expect(stroke).toEqual({
        xs: 0.5,
        sm: 1,
        md: 1.5,
        lg: 3,
      });
    });
  });
});
