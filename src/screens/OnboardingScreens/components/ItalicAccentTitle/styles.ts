import {StyleSheet} from 'react-native';

import type {Theme} from '../../../../utils/types';
import {FONT_FAMILIES} from '../../../../theme/tokens/typography';

export const createStyles = (theme: Theme, align: 'left' | 'center') => {
  // headlineH1 binds to Fraunces-Medium on Latin locales; non-Latin
  // locales fall back to Inter-Medium via `typographyForLocale`. Use
  // family identity to pick the right italic-run cut (Fraunces-Italic
  // for Latin, Inter-Medium + fontStyle:'italic' for non-Latin).
  const isFraunces =
    theme.typography.headlineH1.fontFamily === FONT_FAMILIES.FRAUNCES_MEDIUM;
  return StyleSheet.create({
    // Stack one Text per line inside a centered column so each line
    // centers independently — RN's wrapped-Text centering anchors
    // shorter lines to the longest line's width, not the parent.
    root: {
      alignItems: align === 'center' ? 'center' : 'flex-start',
    },
    title: {
      ...theme.typography.headlineH1,
      color: theme.colors.onBackground,
      textAlign: align,
    },
    italic: isFraunces
      ? {fontFamily: FONT_FAMILIES.FRAUNCES_ITALIC, fontStyle: 'italic'}
      : {fontFamily: FONT_FAMILIES.INTER_MEDIUM, fontStyle: 'italic'},
  });
};
