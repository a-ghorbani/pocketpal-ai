import React from 'react';
import {Text} from 'react-native';
import {act, render, renderHook, waitFor} from '@testing-library/react-native';
import {Provider as PaperProvider} from 'react-native-paper';
import {observer} from 'mobx-react';

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

  // Non-observer consumer reactivity through the React-context path.
  // `useTheme()` calls Paper's `usePaperTheme()`, which subscribes the
  // consumer to Paper's ThemeContext. An `observer` parent feeds the theme
  // to `<PaperProvider>`, so a `uiStore.colorScheme` change must reach a
  // NON-observer child even behind a `React.memo` boundary (mimicking
  // navigator-memoized screens) WITHOUT the test rerendering it manually.
  describe('non-observer consumer subscription', () => {
    it('updates a memoized non-observer child when colorScheme flips', () => {
      const Leaf = () => {
        const theme = useTheme();
        return <Text testID="leaf-bg">{theme.colors.background}</Text>;
      };
      // memo boundary: a parent re-render does NOT propagate here; only a
      // context change can re-render this subtree.
      const MemoBoundary = React.memo(() => <Leaf />);
      // observer parent mirrors App: feeds PaperProvider from the theme.
      const Harness = observer(() => {
        const theme = useTheme();
        return (
          <PaperProvider theme={theme}>
            <MemoBoundary />
          </PaperProvider>
        );
      });

      act(() => {
        uiStore.setColorScheme('light');
      });
      const screen = render(<Harness />);
      const lightBg = screen.getByTestId('leaf-bg').props.children;

      act(() => {
        uiStore.setColorScheme('dark');
      });
      const darkBg = screen.getByTestId('leaf-bg').props.children;

      expect(lightBg).toBe(lightTheme.colors.background);
      expect(darkBg).toBe(darkTheme.colors.background);
      expect(darkBg).not.toBe(lightBg);
    });
  });
});
