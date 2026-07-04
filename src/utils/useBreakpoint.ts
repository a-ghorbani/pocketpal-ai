/**
 * useBreakpoint — reactive hook that resolves the current LayoutTokens
 * from the window width. Re-renders on dimension changes (rotation,
 * window resize on macOS / iPad multitasking).
 *
 * Usage:
 *   const layout = useBreakpoint();
 *   <View style={{paddingHorizontal: layout.horizontalPadding}}>
 *
 * Phase 4.2: macOS/iPad large-screen adaptation.
 */

import {useMemo} from 'react';
import {useWindowDimensions} from 'react-native';

import {resolveLayoutTokens, resolveBreakpoint} from '../theme/layout';
import type {Breakpoint, LayoutTokens} from '../theme/layout';

export interface UseBreakpointResult extends LayoutTokens {
  /** Current window width in dp. */
  width: number;
  /** Current window height in dp. */
  height: number;
  /** Active breakpoint name. */
  breakpoint: Breakpoint;
}

/**
 * Returns the resolved layout tokens for the current window dimensions.
 * Re-renders whenever the window dimensions change.
 */
export function useBreakpoint(): UseBreakpointResult {
  const {width, height} = useWindowDimensions();

  return useMemo<UseBreakpointResult>(() => {
    const tokens = resolveLayoutTokens(width);
    return {
      ...tokens,
      width,
      height,
      breakpoint: tokens.breakpoint,
    };
  }, [width, height]);
}

/**
 * Returns just the active breakpoint name. Cheaper than useBreakpoint()
 * when only the tier is needed.
 */
export function useBreakpointName(): Breakpoint {
  const {width} = useWindowDimensions();
  return useMemo(() => resolveBreakpoint(width), [width]);
}
