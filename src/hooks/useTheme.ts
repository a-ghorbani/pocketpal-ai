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
 * Bounded by modes (2) × supported languages (~12) so it never grows
 * beyond ~24 entries. Memoization restores referential stability across
 * renders that don't change mode or language — important on hot UI
 * surfaces (chat) where downstream `useMemo` deps would otherwise
 * re-fire every render.
 *
 * `buildTheme` already spreads the Paper base theme (MD3DarkTheme /
 * PaperLightTheme), so the result carries every Paper-internal field
 * components reach through `useTheme()`. No separate `usePaperTheme()`
 * merge is needed — and keying the cache on (mode, language) alone is
 * correct because the built theme is the single source for those fields.
 */
const themeCache = new Map<string, Theme>();

export const useTheme = (): Theme => {
  const mode = uiStore.colorScheme;
  const language = uiStore.language;
  const key = `${mode}:${language}`;

  let cached = themeCache.get(key);
  if (cached === undefined) {
    cached = buildTheme({mode, language});
    themeCache.set(key, cached);
  }
  return cached;
};
