/**
 * Breakpoint thresholds + resolved layout tokens (Phase 4.2: macOS/iPad).
 *
 * Pure data — mirrors the tokens module pattern. No React/Paper/MobX.
 *
 * Breakpoint thresholds follow Material Design 3 window-size classes,
 * trimmed to PocketPal's needs (compact / medium / expanded / large).
 *
 *   compact  < 600      phone portrait
 *   medium   600–899    phone landscape / iPad mini portrait
 *   expanded 900–1199   iPad portrait / iPad landscape
 *   large    >= 1200    iPad landscape / macOS window
 */

import type {Breakpoint, BreakpointLayoutMap, LayoutTokens} from './types';

/** Width thresholds (exclusive lower bound → inclusive upper bound). */
export const BREAKPOINTS: Record<Breakpoint, {min: number; max: number}> = {
  compact: {min: 0, max: 599},
  medium: {min: 600, max: 899},
  expanded: {min: 900, max: 1199},
  large: {min: 1200, max: Number.POSITIVE_INFINITY},
};

/** Ordered breakpoint tiers (smallest → largest). */
export const BREAKPOINT_ORDER: Breakpoint[] = [
  'compact',
  'medium',
  'expanded',
  'large',
];

/**
 * Resolved layout tokens per breakpoint. These drive container widths,
 * grid columns, paddings, and master/detail split decisions.
 */
export const LAYOUT_TOKENS: BreakpointLayoutMap = {
  compact: {
    breakpoint: 'compact',
    minWidth: 0,
    maxContentWidth: Number.POSITIVE_INFINITY, // full width on phone
    columns: 1,
    horizontalPadding: 16,
    gutter: 12,
    splitView: false,
    isTablet: false,
  },
  medium: {
    breakpoint: 'medium',
    minWidth: 600,
    maxContentWidth: 600,
    columns: 2,
    horizontalPadding: 24,
    gutter: 16,
    splitView: false, // still stacked
    isTablet: true,
  },
  expanded: {
    breakpoint: 'expanded',
    minWidth: 900,
    maxContentWidth: 840,
    columns: 3,
    horizontalPadding: 32,
    gutter: 20,
    splitView: true, // iPad portrait: master/detail split
    isTablet: true,
  },
  large: {
    breakpoint: 'large',
    minWidth: 1200,
    maxContentWidth: 960,
    columns: 4,
    horizontalPadding: 48,
    gutter: 24,
    splitView: true, // macOS / iPad landscape
    isTablet: true,
  },
};

/**
 * Resolve the active breakpoint for a given window width.
 *
 * @param width Window width in dp/px.
 * @returns The smallest breakpoint whose min threshold is <= width.
 */
export function resolveBreakpoint(width: number): Breakpoint {
  if (width >= BREAKPOINTS.large.min) return 'large';
  if (width >= BREAKPOINTS.expanded.min) return 'expanded';
  if (width >= BREAKPOINTS.medium.min) return 'medium';
  return 'compact';
}

/**
 * Resolve the full LayoutTokens for a given window width.
 * Convenience: combine resolveBreakpoint + LAYOUT_TOKENS lookup.
 */
export function resolveLayoutTokens(width: number): LayoutTokens {
  return LAYOUT_TOKENS[resolveBreakpoint(width)];
}

/**
 * Check if a given width is at least the given breakpoint tier.
 * Useful for one-off capability checks: `isAtLeast(width, 'medium')`.
 */
export function isAtLeast(width: number, tier: Breakpoint): boolean {
  return width >= BREAKPOINTS[tier].min;
}
