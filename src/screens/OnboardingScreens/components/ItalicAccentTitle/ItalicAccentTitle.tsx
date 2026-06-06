import React from 'react';
import {View} from 'react-native';
import {Text} from 'react-native-paper';

import {useTheme} from '../../../../hooks';
import {createStyles} from './styles';

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

/**
 * Splits a title string into a plain run and a Fraunces-italic accent
 * run. When `accent` is omitted (or missing) the whole title renders
 * italic. `title` may contain `\n` — each line renders as its own
 * Text so they center independently of each other's widths.
 */
export const ItalicAccentTitle: React.FC<ItalicAccentTitleProps> = ({
  title,
  accent,
  align = 'center',
}) => {
  const theme = useTheme();
  const styles = createStyles(theme, align);
  const lines = title.split('\n');
  const accentLineIdx = accent
    ? lines.findIndex(line => line.includes(accent))
    : -1;
  return (
    <View style={styles.root}>
      {lines.map((line, i) => {
        if (!accent) {
          return (
            <Text key={i} style={[styles.title, styles.italic]}>
              {line}
            </Text>
          );
        }
        if (i !== accentLineIdx) {
          return (
            <Text key={i} style={styles.title}>
              {line}
            </Text>
          );
        }
        const idx = line.indexOf(accent);
        const before = line.slice(0, idx);
        const after = line.slice(idx + accent.length);
        return (
          <Text key={i} style={styles.title}>
            {before}
            <Text style={styles.italic}>{accent}</Text>
            {after}
          </Text>
        );
      })}
    </View>
  );
};
