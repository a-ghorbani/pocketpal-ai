import React from 'react';
import {StyleSheet} from 'react-native';
import {Text} from 'react-native-paper';

import {useTheme} from '../../../hooks';
import type {Theme} from '../../../utils/types';
import {FONT_FAMILIES} from '../../../theme/tokens/typography';

export type ItalicAccentTitleProps = {
  /** Full title string — may contain `\n` for forced line breaks. */
  title: string;
  /**
   * Substring rendered in Fraunces-Italic. When omitted the entire
   * title renders italic (screen 6 "Pip"). On non-Latin locales the
   * Fraunces family swaps to Inter via the `typographyForLocale`
   * fallback; we mirror that by switching the italic-run family to
   * Inter-Medium + `fontStyle:'italic'` when the base title is
   * already on Inter.
   */
  accent?: string;
  align?: 'left' | 'center';
};

const createStyles = (theme: Theme, align: 'left' | 'center') => {
  // headlineH1 binds to Fraunces-Medium on Latin locales; non-Latin
  // locales fall back to Inter-Medium via `typographyForLocale`. Use
  // family identity to pick the right italic-run cut (Fraunces-Italic
  // for Latin, Inter-Medium + fontStyle:'italic' for non-Latin).
  const isFraunces =
    theme.typography.headlineH1.fontFamily === FONT_FAMILIES.FRAUNCES_MEDIUM;
  return StyleSheet.create({
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

/**
 * Splits a title string into a plain run and a Fraunces-italic accent
 * run. When `accent` is omitted (or missing) the whole title renders
 * italic. Matches the design contract for the per-screen italic
 * accent.
 */
export const ItalicAccentTitle: React.FC<ItalicAccentTitleProps> = ({
  title,
  accent,
  align = 'center',
}) => {
  const theme = useTheme();
  const styles = createStyles(theme, align);
  if (!accent) {
    return <Text style={[styles.title, styles.italic]}>{title}</Text>;
  }
  const idx = title.indexOf(accent);
  if (idx === -1) {
    // Translator drift — render plain title.
    return <Text style={styles.title}>{title}</Text>;
  }
  const before = title.slice(0, idx);
  const after = title.slice(idx + accent.length);
  return (
    <Text style={styles.title}>
      {before}
      <Text style={styles.italic}>{accent}</Text>
      {after}
    </Text>
  );
};
