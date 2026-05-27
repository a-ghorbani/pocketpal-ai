import React from 'react';
import {StyleSheet} from 'react-native';
import {Text} from 'react-native-paper';

import {useTheme} from '../../../hooks';
import type {Theme} from '../../../utils/types';

export type ItalicAccentTitleProps = {
  /** Full title string. */
  title: string;
  /**
   * Substring to render in Fraunces-Italic (or Inter-italic on non-Latin
   * locales — token-driven fallback). When omitted, the whole title is
   * italic (matches screen 2 / screen 6 contract).
   */
  accent?: string;
  align?: 'left' | 'center';
};

const createStyles = (theme: Theme, align: 'left' | 'center') =>
  StyleSheet.create({
    title: {
      ...theme.typography.headlineH1,
      color: theme.colors.onBackground,
      textAlign: align,
    },
    italic: {
      fontStyle: 'italic',
    },
  });

/**
 * Splits a title string into a plain run and a Fraunces-italic accent
 * run. When `accent` is omitted (or missing), the whole title renders
 * italic. Matches the design contract for the per-screen italic accent.
 */
export const ItalicAccentTitle: React.FC<ItalicAccentTitleProps> = ({
  title,
  accent,
  align = 'left',
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
