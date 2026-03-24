import {
  createStateLayer,
  getContrastColor,
  hexToRGBA,
  isLightColor,
  stateLayerOpacity,
  withOpacity,
} from '../colorUtils';

describe('colorUtils', () => {
  it('falls back to black when hex input is invalid', () => {
    expect(hexToRGBA('', 0.4)).toBe('rgba(0, 0, 0, 0.4)');
    expect(hexToRGBA(undefined as unknown as string, 0.6)).toBe(
      'rgba(0, 0, 0, 0.6)',
    );
  });

  it('converts hex colors to rgba', () => {
    expect(hexToRGBA('#336699', 0.5)).toBe('rgba(51, 102, 153, 0.5)');
  });

  it('updates rgba opacity in-place', () => {
    expect(withOpacity('rgba(10, 20, 30, 0.7)', 0.2)).toBe(
      'rgba(10, 20, 30, 0.2)',
    );
  });

  it('falls back to black when color input is invalid', () => {
    expect(withOpacity('', 0.25)).toBe('rgba(0, 0, 0, 0.25)');
    expect(withOpacity(undefined as unknown as string, 0.8)).toBe(
      'rgba(0, 0, 0, 0.8)',
    );
  });

  it('detects light and dark colors across supported formats', () => {
    expect(isLightColor('#ffffff')).toBe(true);
    expect(isLightColor('#000000')).toBe(false);
    expect(isLightColor('rgba(255, 255, 255, 0.4)')).toBe(true);
    expect(isLightColor('rgba(10, 20, 30, 0.9)')).toBe(false);
  });

  it('treats invalid or unknown formats as light', () => {
    expect(isLightColor('rgba(nope)')).toBe(true);
    expect(isLightColor('blue')).toBe(true);
    expect(isLightColor(undefined as unknown as string)).toBe(true);
  });

  it('returns contrasting colors and state layers', () => {
    expect(getContrastColor('#ffffff')).toBe('#000000');
    expect(getContrastColor('#000000')).toBe('#FFFFFF');
    expect(getContrastColor(undefined as unknown as string)).toBe('#FFFFFF');
    expect(createStateLayer('#336699', 'hover')).toBe(
      `rgba(51, 102, 153, ${stateLayerOpacity.hover})`,
    );
  });
});
