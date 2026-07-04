/**
 * useBreakpoint hook tests (Phase 4.2: macOS/iPad).
 *
 * Mocks only the useWindowDimensions export from react-native. The hook
 * itself is a thin wrapper around resolveLayoutTokens() (tested in
 * breakpoints.test.ts) — these tests verify the reactivity contract.
 */

let mockDimensions = {width: 375, height: 812, scale: 1, fontScale: 1};

// Minimal react-native mock — only what useBreakpoint imports.
// Avoid jest.requireActual('react-native') which pulls TurboModuleRegistry.
jest.mock('react-native', () => ({
  useWindowDimensions: () => mockDimensions,
}));

import {renderHook} from '@testing-library/react-hooks';
import {useBreakpoint, useBreakpointName} from '../useBreakpoint';

describe('useBreakpoint', () => {
  beforeEach(() => {
    mockDimensions = {width: 375, height: 812, scale: 1, fontScale: 1};
  });

  it('returns compact tokens for phone width', () => {
    const {result} = renderHook(() => useBreakpoint());

    expect(result.current.breakpoint).toBe('compact');
    expect(result.current.columns).toBe(1);
    expect(result.current.splitView).toBe(false);
    expect(result.current.isTablet).toBe(false);
    expect(result.current.width).toBe(375);
    expect(result.current.height).toBe(812);
  });

  it('updates to medium when dimensions change', () => {
    const {result, rerender} = renderHook(() => useBreakpoint());

    expect(result.current.breakpoint).toBe('compact');

    // Simulate rotation to landscape
    mockDimensions = {width: 844, height: 390, scale: 1, fontScale: 1};
    rerender();

    expect(result.current.breakpoint).toBe('medium');
    expect(result.current.columns).toBe(2);
    expect(result.current.isTablet).toBe(true);
  });

  it('returns expanded tokens for iPad portrait', () => {
    mockDimensions = {width: 1024, height: 1366, scale: 1, fontScale: 1};
    const {result} = renderHook(() => useBreakpoint());

    expect(result.current.breakpoint).toBe('expanded');
    expect(result.current.columns).toBe(3);
    expect(result.current.splitView).toBe(true);
    expect(result.current.isTablet).toBe(true);
  });

  it('returns large tokens for iPad landscape', () => {
    mockDimensions = {width: 1366, height: 1024, scale: 1, fontScale: 1};
    const {result} = renderHook(() => useBreakpoint());

    expect(result.current.breakpoint).toBe('large');
    expect(result.current.columns).toBe(4);
    expect(result.current.splitView).toBe(true);
  });

  it('includes maxContentWidth in the result', () => {
    mockDimensions = {width: 1024, height: 1366, scale: 1, fontScale: 1};
    const {result} = renderHook(() => useBreakpoint());

    expect(result.current.maxContentWidth).toBe(840); // expanded
  });

  it('compact has unbounded maxContentWidth', () => {
    mockDimensions = {width: 375, height: 812, scale: 1, fontScale: 1};
    const {result} = renderHook(() => useBreakpoint());

    expect(result.current.maxContentWidth).toBe(Infinity);
  });

  it('includes horizontalPadding and gutter from layout tokens', () => {
    mockDimensions = {width: 1024, height: 1366, scale: 1, fontScale: 1};
    const {result} = renderHook(() => useBreakpoint());

    expect(result.current.horizontalPadding).toBe(32); // expanded
    expect(result.current.gutter).toBe(20); // expanded
  });
});

describe('useBreakpointName', () => {
  beforeEach(() => {
    mockDimensions = {width: 375, height: 812, scale: 1, fontScale: 1};
  });

  it('returns just the breakpoint name', () => {
    const {result} = renderHook(() => useBreakpointName());
    expect(result.current).toBe('compact');
  });

  it('updates when dimensions change', () => {
    const {result, rerender} = renderHook(() => useBreakpointName());

    expect(result.current).toBe('compact');

    mockDimensions = {width: 1200, height: 800, scale: 1, fontScale: 1};
    rerender();

    expect(result.current).toBe('large');
  });

  it('returns a string (lighter than useBreakpoint)', () => {
    const {result} = renderHook(() => useBreakpointName());
    expect(typeof result.current).toBe('string');
  });
});
