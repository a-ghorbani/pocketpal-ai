import {useTheme as usePaperTheme, MD3Theme} from 'react-native-paper';

import {uiStore} from '../store';

import {Theme} from '../utils/types';
import {buildTheme} from '../utils/theme';

/**
 * Consumes the active design-system Theme.
 *
 * Subscribes (via MobX observation, when invoked from an `observer`
 * component) to both `uiStore.colorScheme` and `uiStore.language` and
 * rebuilds the Theme per render. The locale subscription is what makes
 * the Fraunces → Inter fallback (for non-Latin locales) react to
 * language changes without per-component code.
 *
 * The `usePaperTheme<MD3Theme>()` spread preserves any Paper-internal
 * fields that components reach through `useTheme()` (rare, but kept for
 * Paper-compat — same merge pattern as before this slice).
 */
export const useTheme = (): Theme => {
  const paperTheme = usePaperTheme<MD3Theme>();

  const theme = buildTheme({
    mode: uiStore.colorScheme,
    language: uiStore.language,
  });

  return {
    ...paperTheme,
    ...theme,
  } as Theme;
};
