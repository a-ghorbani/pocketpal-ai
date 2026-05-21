import {
  isBenchmarkRunnerUrl,
  parseBenchmarkAutostart,
} from '../navigationConstants';

describe('navigationConstants', () => {
  describe('isBenchmarkRunnerUrl', () => {
    it('matches the bare bench URL', () => {
      expect(isBenchmarkRunnerUrl('pocketpal://e2e/benchmark')).toBe(true);
    });

    it('matches the bench URL with a query string (prefix tolerates query)', () => {
      expect(
        isBenchmarkRunnerUrl('pocketpal://e2e/benchmark?autostart=1'),
      ).toBe(true);
    });

    it('does not match unrelated URLs', () => {
      expect(isBenchmarkRunnerUrl('pocketpal://chat?palId=foo')).toBe(false);
      expect(isBenchmarkRunnerUrl('pocketpal://e2e/other')).toBe(false);
    });

    it('does not match null / undefined', () => {
      expect(isBenchmarkRunnerUrl(null)).toBe(false);
      expect(isBenchmarkRunnerUrl(undefined)).toBe(false);
    });
  });

  describe('parseBenchmarkAutostart', () => {
    it('returns true for autostart=1', () => {
      expect(
        parseBenchmarkAutostart('pocketpal://e2e/benchmark?autostart=1'),
      ).toBe(true);
    });

    it('returns true for autostart=true (case-insensitive)', () => {
      expect(
        parseBenchmarkAutostart('pocketpal://e2e/benchmark?autostart=true'),
      ).toBe(true);
      expect(
        parseBenchmarkAutostart('pocketpal://e2e/benchmark?autostart=TRUE'),
      ).toBe(true);
      expect(
        parseBenchmarkAutostart('pocketpal://e2e/benchmark?autostart=True'),
      ).toBe(true);
    });

    it('returns true when autostart sits alongside other query params', () => {
      expect(
        parseBenchmarkAutostart(
          'pocketpal://e2e/benchmark?foo=bar&autostart=1',
        ),
      ).toBe(true);
    });

    it('returns false for autostart=0', () => {
      expect(
        parseBenchmarkAutostart('pocketpal://e2e/benchmark?autostart=0'),
      ).toBe(false);
    });

    it('returns false for autostart=false', () => {
      expect(
        parseBenchmarkAutostart('pocketpal://e2e/benchmark?autostart=false'),
      ).toBe(false);
    });

    it('returns false for an unrecognized value (garbage)', () => {
      expect(
        parseBenchmarkAutostart('pocketpal://e2e/benchmark?autostart=banana'),
      ).toBe(false);
      expect(
        parseBenchmarkAutostart('pocketpal://e2e/benchmark?autostart='),
      ).toBe(false);
      expect(
        parseBenchmarkAutostart('pocketpal://e2e/benchmark?autostart=11'),
      ).toBe(false);
    });

    it('returns false for the bare URL (no query)', () => {
      expect(parseBenchmarkAutostart('pocketpal://e2e/benchmark')).toBe(false);
    });

    it('returns false when the query has no autostart key', () => {
      expect(parseBenchmarkAutostart('pocketpal://e2e/benchmark?foo=bar')).toBe(
        false,
      );
    });

    it('returns false for null / undefined / non-string without throwing', () => {
      expect(parseBenchmarkAutostart(null)).toBe(false);
      expect(parseBenchmarkAutostart(undefined)).toBe(false);
      // Defends against a non-string slipping past the type contract.
      expect(parseBenchmarkAutostart(42 as unknown as string)).toBe(false);
    });

    it('returns false for a malformed/garbage string without throwing', () => {
      expect(() => parseBenchmarkAutostart('not a url at all')).not.toThrow();
      expect(parseBenchmarkAutostart('not a url at all')).toBe(false);
      expect(parseBenchmarkAutostart('???')).toBe(false);
    });

    it('iOS-origin and Android-origin parity: same raw URL resolves identically', () => {
      // Both delivery sites resolve from the same raw URL via this one
      // helper, so an iOS (DeepLinkService) launch and an Android (Linking)
      // launch of the same URL cannot diverge in truthiness. This is the
      // unit-level parity guarantee that the two routing paths share.
      const url = 'pocketpal://e2e/benchmark?autostart=1';
      const androidOrigin = parseBenchmarkAutostart(url);
      const iosOrigin = parseBenchmarkAutostart(url);
      expect(androidOrigin).toBe(iosOrigin);
      expect(androidOrigin).toBe(true);
    });
  });
});
