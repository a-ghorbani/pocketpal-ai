import {plusScreenState} from '../plusScreenState';
import type {PlusScreenInputs} from '../plusScreenState';

const idle: PlusScreenInputs = {
  plusUnlocked: false,
  plusFlow: 'idle',
  plusPending: false,
  availability: 'ready',
  plusChecked: true,
  plusProductsLoading: false,
  ramBytes: 8e9,
  productCount: 4,
  lastBuyFailed: false,
  showsLicenseNotice: false,
  anyFeatureRunnable: true,
};

const phase = (overrides: Partial<PlusScreenInputs>) =>
  plusScreenState({...idle, ...overrides}).phase;

describe('plusScreenState', () => {
  it('is idle when everything has loaded', () => {
    expect(plusScreenState(idle)).toEqual({
      phase: 'idle',
      error: false,
      licence: false,
      unsupported: false,
    });
  });

  it('shows purchased first, even while paying', () => {
    expect(phase({plusUnlocked: true, plusFlow: 'paying'})).toBe('purchased');
    expect(phase({plusUnlocked: true, plusPending: true})).toBe('purchased');
    expect(phase({plusUnlocked: true, availability: 'unavailable'})).toBe(
      'purchased',
    );
  });

  it('shows paying before pending', () => {
    expect(phase({plusFlow: 'paying', plusPending: true})).toBe('paying');
  });

  it('shows pending before billing state', () => {
    expect(phase({plusPending: true, availability: 'unavailable'})).toBe(
      'pending',
    );
  });

  it('shows unavailable billing before the first check', () => {
    expect(phase({availability: 'unavailable', plusChecked: false})).toBe(
      'unavailable',
    );
  });

  it.each<[string, Partial<PlusScreenInputs>]>([
    ['billing initializing', {availability: 'initializing'}],
    ['first check open', {plusChecked: false}],
    ['products loading', {plusProductsLoading: true, productCount: 0}],
    ['RAM unknown', {ramBytes: null}],
  ])('is loading while %s', (_label, overrides) => {
    expect(phase(overrides)).toBe('loading');
  });

  it('stays idle while a missing price reloads', () => {
    expect(phase({plusProductsLoading: true, productCount: 3})).toBe('idle');
  });

  it('is unavailable when the store returned no product after loading', () => {
    expect(phase({productCount: 0})).toBe('unavailable');
  });

  it('shows the error line only when idle', () => {
    expect(plusScreenState({...idle, lastBuyFailed: true}).error).toBe(true);
    expect(
      plusScreenState({...idle, lastBuyFailed: true, plusFlow: 'paying'}).error,
    ).toBe(false);
    expect(
      plusScreenState({...idle, lastBuyFailed: true, plusPending: true}).error,
    ).toBe(false);
  });

  it('shows the licence line while buying', () => {
    expect(plusScreenState({...idle, showsLicenseNotice: true}).licence).toBe(
      true,
    );
    expect(
      plusScreenState({...idle, showsLicenseNotice: true, plusFlow: 'paying'})
        .licence,
    ).toBe(true);
    expect(
      plusScreenState({...idle, showsLicenseNotice: true, plusUnlocked: true})
        .licence,
    ).toBe(false);
    expect(
      plusScreenState({
        ...idle,
        showsLicenseNotice: true,
        availability: 'unavailable',
      }).licence,
    ).toBe(false);
  });

  it('flags an unsupported device while buying', () => {
    expect(
      plusScreenState({...idle, anyFeatureRunnable: false}).unsupported,
    ).toBe(true);
    expect(
      plusScreenState({...idle, anyFeatureRunnable: false, plusUnlocked: true})
        .unsupported,
    ).toBe(false);
  });
});
