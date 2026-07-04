/**
 * Layout token types for responsive design (Phase 4.2: macOS/iPad).
 *
 * Pure data types. No React, no Paper, no MobX imports.
 *
 * Three-tier breakpoint system mirroring Material Design 3 window-size
 * classes, adapted for the PocketPal mobile-first context:
 *
 *   compact  < 600      phone portrait
 *   medium   600–899    phone landscape / iPad mini portrait
 *   expanded 900–1199   iPad portrait / iPad landscape
 *   large    >= 1200    iPad landscape / macOS window
 *
 * Components opt in by reading the resolved LayoutTokens for the current
 * breakpoint — same pattern as design tokens (resolve once, consume
 * everywhere). The useBreakpoint() hook in src/utils/ provides the
 * reactive binding.
 */

export type Breakpoint = 'compact' | 'medium' | 'expanded' | 'large';

/**
 * Layout tokens resolved for a given breakpoint.
 * All values are in dp/px.
 */
export interface LayoutTokens {
  /** Active breakpoint. */
  breakpoint: Breakpoint;
  /** Min width for this breakpoint tier. */
  minWidth: number;
  /** Max content width — content should be centered with this max width. */
  maxContentWidth: number;
  /** Number of columns for grid layouts. */
  columns: number;
  /** Horizontal padding for screen-level containers. */
  horizontalPadding: number;
  /** Gutter between grid items. */
  gutter: number;
  /** Whether the layout should use a side-by-side (master/detail) split. */
  splitView: boolean;
  /** Whether the device form factor is a tablet/desktop (vs phone). */
  isTablet: boolean;
}

/**
 * Per-breakpoint token sets. Indexable by Breakpoint.
 */
export type BreakpointLayoutMap = Record<Breakpoint, LayoutTokens>;
