import {useTheme as usePaperTheme, MD3Theme} from 'react-native-paper';

import {uiStore} from '../store';

import {Theme} from '../utils/types';
import {buildTheme} from '../utils/theme';

/**
 * Consumes the active design-system Theme.
 *
 * Reads `uiStore.colorScheme` and `uiStore.language` (reactive inside an
 * `observer`) and `usePaperTheme()`. The `usePaperTheme()` call is load-
 * bearing: it subscribes the consumer to Paper's ThemeContext, which is
 * the React-context path that re-renders NON-`observer` consumers (and
 * consumers behind `React.memo` / navigator boundaries) when the provider
 * theme changes. `App` (an `observer`) feeds `useTheme()`'s result to
 * `<PaperProvider theme={...}>`, so a colorScheme/language change updates
 * the provider theme and propagates through context to every consumer.
 *
 * Memoization: built themes are cached in a WeakMap keyed first on the
 * Paper theme identity (so a changed provider theme can never return a
 * stale merge) then on `${mode}:${language}`. This restores referential
 * stability across renders that don't change any of those inputs —
 * important on hot UI surfaces (chat) where downstream `useMemo` deps
 * would otherwise re-fire every render. The WeakMap lets stale Paper-theme
 * buckets be garbage-collected.
 */
const themeCache = new WeakMap<MD3Theme, Map<string, Theme>>();

export const useTheme = (): Theme => {
  const paperTheme = usePaperTheme<MD3Theme>();
  const mode = uiStore.colorScheme;
  const language = uiStore.language;
  const key = `${mode}:${language}`;

  let byKey = themeCache.get(paperTheme);
  if (byKey === undefined) {
    byKey = new Map();
    themeCache.set(paperTheme, byKey);
  }

  let cached = byKey.get(key);
  if (cached === undefined) {
    cached = {
      ...paperTheme,
      ...buildTheme({mode, language}),
    } as Theme;
    byKey.set(key, cached);
  }
  return cached;
};
