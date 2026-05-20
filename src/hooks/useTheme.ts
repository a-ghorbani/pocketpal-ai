import {useTheme as usePaperTheme, MD3Theme} from 'react-native-paper';

import {uiStore} from '../store';

import {Theme} from '../utils/types';
import {buildTheme} from '../utils/theme';

/**
 * Consumes the active design-system Theme.
 *
 * Subscribes (via MobX observation, when invoked from an `observer`
 * component) to both `uiStore.colorScheme` and `uiStore.language` and
 * returns a Theme matching the current (mode, language) pair.
 *
 * Built themes are memoized at the module level by `${mode}:${language}`.
 * The cache is bounded by the cartesian product of modes (2) × supported
 * languages (~12) so it can never grow beyond ~24 entries. Memoization
 * restores referential stability for the returned Theme across renders
 * that don't change mode or language — important on hot UI surfaces
 * (e.g. chat with many message components) where downstream `useMemo`
 * deps would otherwise re-fire every render.
 *
 * The `usePaperTheme<MD3Theme>()` spread preserves any Paper-internal
 * fields components reach through `useTheme()` (rare, but kept for
 * Paper-compat). `paperTheme` is itself referentially stable per
 * `<PaperProvider>` mount (it's the context value), so it participates
 * in the cached object's identity implicitly.
 */
const themeCache = new Map<string, Theme>();

export const useTheme = (): Theme => {
  const paperTheme = usePaperTheme<MD3Theme>();
  const mode = uiStore.colorScheme;
  const language = uiStore.language;
  const key = `${mode}:${language}`;

  let cached = themeCache.get(key);
  if (cached === undefined) {
    cached = {
      ...paperTheme,
      ...buildTheme({mode, language}),
    } as Theme;
    themeCache.set(key, cached);
  }
  return cached;
};
