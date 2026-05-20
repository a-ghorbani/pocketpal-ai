import {renderHook, waitFor} from '@testing-library/react-native';

jest.unmock('../useTheme');
jest.unmock('../../store');
import {useTheme} from '../useTheme';

import {uiStore} from '../../store';

import {darkTheme, lightTheme} from '../../utils/theme';
import {FONT_FAMILIES} from '../../theme/tokens';

describe('useTheme', () => {
  beforeEach(() => {
    uiStore.setColorScheme('light');
    uiStore.setLanguage('en');
  });

  it('should return light theme when colorScheme is light', () => {
    const {result} = renderHook(() => useTheme());

    expect(result.current).toEqual(
      expect.objectContaining({
        ...lightTheme,
      }),
    );
  });

  it('should return dark theme when colorScheme is dark', async () => {
    uiStore.setColorScheme('dark');

    const {result} = renderHook(() => useTheme());

    // Wait for the theme change to be applied
    await waitFor(() => {
      expect(result.current).toEqual(
        expect.objectContaining({
          ...darkTheme,
        }),
      );
    });
  });

  // Mode swap is reactive.
  // The hook re-reads `uiStore.colorScheme` on every render, so a state
  // change followed by a re-render must produce the dark token surface.
  // This is the hook-level reactivity gate (component-level reactivity
  // is provided by `observer`-wrapping in real call sites).
  describe('mode swap reactivity', () => {
    it('rerender after setColorScheme("dark") yields dark background', () => {
      const {result, rerender} = renderHook(() => useTheme());
      expect(result.current.colors.background).toBe(
        lightTheme.colors.background,
      );

      uiStore.setColorScheme('dark');
      rerender({});

      expect(result.current.colors.background).toBe(
        darkTheme.colors.background,
      );
    });

    it('rerender after toggling colorScheme back to light restores light surface', () => {
      uiStore.setColorScheme('dark');
      const {result, rerender} = renderHook(() => useTheme());
      expect(result.current.colors.background).toBe(
        darkTheme.colors.background,
      );

      uiStore.setColorScheme('light');
      rerender({});

      expect(result.current.colors.background).toBe(
        lightTheme.colors.background,
      );
    });
  });

  // Language swap is reactive (typography fallback applies).
  // Hook-level: changing uiStore.language and rerendering produces a Theme
  // whose Fraunces typography token resolves to Inter on the next render.
  describe('language swap reactivity', () => {
    it('headlineH1 swaps Fraunces → Inter when language changes to fa', () => {
      const {result, rerender} = renderHook(() => useTheme());
      expect(result.current.typography.headlineH1.fontFamily).toBe(
        FONT_FAMILIES.FRAUNCES_REGULAR,
      );

      uiStore.setLanguage('fa');
      rerender({});

      expect(result.current.typography.headlineH1.fontFamily).toBe(
        FONT_FAMILIES.INTER_REGULAR,
      );
    });

    it('headlineH1 swaps Fraunces → Inter for Cyrillic locales (ru, uk)', () => {
      // Bundled Fraunces subset is Latin-only — ru/uk must use Inter.
      for (const lang of ['ru', 'uk'] as const) {
        uiStore.setLanguage(lang);
        const {result} = renderHook(() => useTheme());
        expect(result.current.typography.headlineH1.fontFamily).toBe(
          FONT_FAMILIES.INTER_REGULAR,
        );
      }
    });

    it('headlineH1 swaps for every non-Latin / non-Latin-script locale', () => {
      const fallbackLocales: Array<
        'fa' | 'he' | 'ja' | 'ko' | 'ru' | 'uk' | 'zh' | 'zh_Hant'
      > = ['fa', 'he', 'ja', 'ko', 'ru', 'uk', 'zh', 'zh_Hant'];
      for (const lang of fallbackLocales) {
        uiStore.setLanguage(lang);
        const {result} = renderHook(() => useTheme());
        expect(result.current.typography.headlineH1.fontFamily).toBe(
          FONT_FAMILIES.INTER_REGULAR,
        );
      }
    });

    it('codeM stays JetBrainsMono for non-Latin locales (locale-agnostic)', () => {
      uiStore.setLanguage('ja');
      const {result} = renderHook(() => useTheme());
      expect(result.current.typography.codeM.fontFamily).toBe(
        FONT_FAMILIES.JETBRAINS_MONO_REGULAR,
      );
    });
  });
});
