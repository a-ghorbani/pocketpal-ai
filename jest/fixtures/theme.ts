import type {Theme} from '../../src/utils/types';
import {buildTheme, darkTheme, lightTheme} from '../../src/utils/theme';
import type {AvailableLanguage} from '../../src/locales';

type Mode = 'light' | 'dark';

const cache = new Map<string, Theme>();

const getByModeLocale = (mode: Mode, language: AvailableLanguage): Theme => {
  const key = `${mode}::${language}`;
  let theme = cache.get(key);
  if (!theme) {
    theme = buildTheme({mode, language});
    cache.set(key, theme);
  }
  return theme;
};

export const themeFixtures = {
  lightTheme: lightTheme,
  darkTheme: darkTheme,

  // customization for individual tests
  createTheme: (overrides: {colors?: Record<string, string>}): Theme => ({
    ...themeFixtures.lightTheme,
    ...overrides,
    colors: {
      ...themeFixtures.lightTheme.colors,
      ...(overrides.colors || {}),
    },
  }),

  // Memoized theme factory keyed by (mode, language).
  // DS snapshot matrix uses this to render against real themes for
  // mode in {light, dark} and locale in {en, fa, ...} without paying
  // the buildTheme cost per test cell.
  byMode: (mode: Mode) => ({
    byLocale: (language: AvailableLanguage) => getByModeLocale(mode, language),
  }),
};
