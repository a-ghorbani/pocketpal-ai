/**
 * Layout tokens barrel export (Phase 4.2: macOS/iPad).
 *
 * Pure data + types. No React, no Paper, no MobX.
 * Reactive binding lives in src/utils/useBreakpoint.ts.
 */

export type {Breakpoint, LayoutTokens, BreakpointLayoutMap} from './types';

export {
  BREAKPOINTS,
  BREAKPOINT_ORDER,
  LAYOUT_TOKENS,
  resolveBreakpoint,
  resolveLayoutTokens,
  isAtLeast,
} from './breakpoints';
