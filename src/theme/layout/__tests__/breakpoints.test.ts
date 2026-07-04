/**
 * Layout breakpoint tests (Phase 4.2: macOS/iPad).
 *
 * Pure data tests — no React, no mocking needed.
 */

import {
  BREAKPOINTS,
  BREAKPOINT_ORDER,
  LAYOUT_TOKENS,
  resolveBreakpoint,
  resolveLayoutTokens,
  isAtLeast,
} from '../breakpoints';
import type {Breakpoint} from '../types';

describe('BREAKPOINTS thresholds', () => {
  it('defines all four tiers', () => {
    expect(Object.keys(BREAKPOINTS).sort()).toEqual([
      'compact',
      'expanded',
      'large',
      'medium',
    ]);
  });

  it('thresholds are monotonically increasing', () => {
    const mins = BREAKPOINT_ORDER.map(b => BREAKPOINTS[b].min);
    for (let i = 1; i < mins.length; i++) {
      expect(mins[i]).toBeGreaterThan(mins[i - 1]);
    }
  });

  it('compact starts at 0', () => {
    expect(BREAKPOINTS.compact.min).toBe(0);
  });

  it('large has no upper bound', () => {
    expect(BREAKPOINTS.large.max).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('BREAKPOINT_ORDER', () => {
  it('orders from smallest to largest', () => {
    expect(BREAKPOINT_ORDER).toEqual([
      'compact',
      'medium',
      'expanded',
      'large',
    ]);
  });
});

describe('LAYOUT_TOKENS', () => {
  it('has a token set for every breakpoint', () => {
    for (const bp of BREAKPOINT_ORDER) {
      expect(LAYOUT_TOKENS[bp]).toBeDefined();
      expect(LAYOUT_TOKENS[bp].breakpoint).toBe(bp);
    }
  });

  it('compact: single column, no split, not tablet', () => {
    const t = LAYOUT_TOKENS.compact;
    expect(t.columns).toBe(1);
    expect(t.splitView).toBe(false);
    expect(t.isTablet).toBe(false);
  });

  it('medium: 2 columns, not split, is tablet', () => {
    const t = LAYOUT_TOKENS.medium;
    expect(t.columns).toBe(2);
    expect(t.splitView).toBe(false);
    expect(t.isTablet).toBe(true);
  });

  it('expanded: 3 columns, split view, is tablet', () => {
    const t = LAYOUT_TOKENS.expanded;
    expect(t.columns).toBe(3);
    expect(t.splitView).toBe(true);
    expect(t.isTablet).toBe(true);
  });

  it('large: 4 columns, split view, is tablet', () => {
    const t = LAYOUT_TOKENS.large;
    expect(t.columns).toBe(4);
    expect(t.splitView).toBe(true);
    expect(t.isTablet).toBe(true);
  });

  it('columns increase with breakpoint', () => {
    const cols = BREAKPOINT_ORDER.map(b => LAYOUT_TOKENS[b].columns);
    for (let i = 1; i < cols.length; i++) {
      expect(cols[i]).toBeGreaterThan(cols[i - 1]);
    }
  });

  it('horizontal padding increases with breakpoint', () => {
    const pads = BREAKPOINT_ORDER.map(b => LAYOUT_TOKENS[b].horizontalPadding);
    for (let i = 1; i < pads.length; i++) {
      expect(pads[i]).toBeGreaterThan(pads[i - 1]);
    }
  });

  it('compact has unbounded max content width (full-width phone)', () => {
    expect(LAYOUT_TOKENS.compact.maxContentWidth).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it('non-compact has a finite max content width', () => {
    expect(LAYOUT_TOKENS.medium.maxContentWidth).toBeLessThan(Infinity);
    expect(LAYOUT_TOKENS.expanded.maxContentWidth).toBeLessThan(Infinity);
    expect(LAYOUT_TOKENS.large.maxContentWidth).toBeLessThan(Infinity);
  });
});

describe('resolveBreakpoint', () => {
  it('returns compact for phone-width screens', () => {
    expect(resolveBreakpoint(320)).toBe('compact'); // iPhone SE
    expect(resolveBreakpoint(375)).toBe('compact'); // iPhone 13
    expect(resolveBreakpoint(414)).toBe('compact'); // iPhone 14 Pro Max
    expect(resolveBreakpoint(599)).toBe('compact'); // boundary
  });

  it('returns medium for small tablets / phone landscape', () => {
    expect(resolveBreakpoint(600)).toBe('medium'); // boundary
    expect(resolveBreakpoint(768)).toBe('medium'); // iPad mini portrait
    expect(resolveBreakpoint(899)).toBe('medium'); // boundary
  });

  it('returns expanded for iPad portrait', () => {
    expect(resolveBreakpoint(900)).toBe('expanded'); // boundary
    expect(resolveBreakpoint(1024)).toBe('expanded'); // iPad portrait
    expect(resolveBreakpoint(1199)).toBe('expanded'); // boundary
  });

  it('returns large for iPad landscape / macOS', () => {
    expect(resolveBreakpoint(1200)).toBe('large'); // boundary
    expect(resolveBreakpoint(1366)).toBe('large'); // iPad Pro 12.9 landscape
    expect(resolveBreakpoint(1920)).toBe('large'); // macOS window
    expect(resolveBreakpoint(2560)).toBe('large'); // large display
  });

  it('handles 0 width gracefully (compact)', () => {
    expect(resolveBreakpoint(0)).toBe('compact');
  });

  it('boundary inclusivity: min value of tier belongs to that tier', () => {
    // Each tier's min should resolve to that tier, not the one below
    expect(resolveBreakpoint(600)).toBe('medium');
    expect(resolveBreakpoint(900)).toBe('expanded');
    expect(resolveBreakpoint(1200)).toBe('large');
  });
});

describe('resolveLayoutTokens', () => {
  it('returns the full token set for the resolved breakpoint', () => {
    const tokens = resolveLayoutTokens(1024);
    expect(tokens.breakpoint).toBe('expanded');
    expect(tokens.columns).toBe(3);
    expect(tokens.splitView).toBe(true);
  });

  it('compact tokens for phone widths', () => {
    const tokens = resolveLayoutTokens(375);
    expect(tokens.breakpoint).toBe('compact');
    expect(tokens.isTablet).toBe(false);
  });

  it('large tokens for macOS widths', () => {
    const tokens = resolveLayoutTokens(1920);
    expect(tokens.breakpoint).toBe('large');
    expect(tokens.columns).toBe(4);
    expect(tokens.splitView).toBe(true);
  });
});

describe('isAtLeast', () => {
  it('returns true when width meets the tier threshold', () => {
    expect(isAtLeast(600, 'medium')).toBe(true);
    expect(isAtLeast(900, 'medium')).toBe(true);
    expect(isAtLeast(1200, 'large')).toBe(true);
  });

  it('returns false when width is below the tier threshold', () => {
    expect(isAtLeast(599, 'medium')).toBe(false);
    expect(isAtLeast(899, 'expanded')).toBe(false);
    expect(isAtLeast(1199, 'large')).toBe(false);
  });

  it('compact tier is always true (min = 0)', () => {
    expect(isAtLeast(0, 'compact')).toBe(true);
    expect(isAtLeast(10000, 'compact')).toBe(true);
  });
});
