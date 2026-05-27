import React from 'react';
import {StyleSheet, Text} from 'react-native';

import {useTheme} from '../../../hooks';
import type {Theme} from '../../../utils/types';

export type HighlightTextProps = {
  /** Body copy to render; may contain one or more highlighted phrases. */
  body: string;
  /** Phrases to wrap in a peach pill. Order is preserved. */
  phrases: string[];
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    body: {
      ...theme.typography.bodyM,
      color: theme.colors.textSecondary,
    },
    pill: {
      backgroundColor: theme.colors.accent.peach,
      color: theme.colors.text,
      paddingHorizontal: theme.spacing.xs,
      borderRadius: theme.radius.xs,
    },
  });

/**
 * Split `body` around each phrase in `phrases`. Matched runs render
 * inside a nested <Text> with a peach pill background; unmatched runs
 * render plain. Phrase matching is case-sensitive and exact-substring
 * (matches the design contract — phrases are translator-edited).
 *
 * If no phrase appears in `body`, the body renders plain (fallback for
 * translator drift).
 */
function splitOnPhrases(
  body: string,
  phrases: string[],
): Array<{text: string; highlighted: boolean}> {
  let segments: Array<{text: string; highlighted: boolean}> = [
    {text: body, highlighted: false},
  ];
  for (const phrase of phrases) {
    if (!phrase) {
      continue;
    }
    const next: Array<{text: string; highlighted: boolean}> = [];
    for (const seg of segments) {
      if (seg.highlighted) {
        next.push(seg);
        continue;
      }
      const parts = seg.text.split(phrase);
      for (let i = 0; i < parts.length; i++) {
        if (parts[i]) {
          next.push({text: parts[i], highlighted: false});
        }
        if (i < parts.length - 1) {
          next.push({text: phrase, highlighted: true});
        }
      }
    }
    segments = next;
  }
  return segments;
}

export const HighlightText: React.FC<HighlightTextProps> = ({body, phrases}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const segments = splitOnPhrases(body, phrases);
  return (
    <Text style={styles.body}>
      {segments.map((seg, idx) =>
        seg.highlighted ? (
          <Text key={idx} style={styles.pill}>
            {seg.text}
          </Text>
        ) : (
          <Text key={idx}>{seg.text}</Text>
        ),
      )}
    </Text>
  );
};
