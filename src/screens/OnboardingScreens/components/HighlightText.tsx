import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {useTheme} from '../../../hooks';
import type {Theme} from '../../../utils/types';

export type HighlightTextProps = {
  /** Body copy to render; may contain one or more highlighted phrases. */
  body: string;
  /** Phrases to wrap in a peach pill. Order is preserved. */
  phrases: string[];
  /** Text alignment (centered on screens 1–4). */
  align?: 'left' | 'center';
};

const createStyles = (theme: Theme, align: 'left' | 'center') =>
  StyleSheet.create({
    bodyText: {
      ...theme.typography.bodyM,
      color: theme.colors.onSurfaceVariant,
      textAlign: align,
    },
    pillRun: {
      // The Figma highlight is a peach rectangle laid under a darker
      // text span via mix-blend-multiply. RN can't reproduce the
      // blend directly; the closest faithful approximation is a
      // background-coloured run with the darker foreground text
      // colour. `accent.peach` is the canonical token (#FCE7CF).
      backgroundColor: theme.colors.accent.peach,
      color: theme.colors.text,
    },
  });

/**
 * Split `body` around each phrase in `phrases`. Matched runs render
 * inside a nested `<Text>` with a peach pill background; unmatched
 * runs render plain. Phrase matching is case-sensitive and
 * exact-substring (matches the design contract — phrases are
 * translator-edited).
 *
 * If no phrase appears in `body`, the body renders plain (fallback
 * for translator drift).
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

export const HighlightText: React.FC<HighlightTextProps> = ({
  body,
  phrases,
  align = 'center',
}) => {
  const theme = useTheme();
  const styles = createStyles(theme, align);
  const segments = splitOnPhrases(body, phrases);
  return (
    <View style={{width: '100%'}}>
      <Text style={styles.bodyText}>
        {segments.map((seg, idx) =>
          seg.highlighted ? (
            <Text key={idx} style={styles.pillRun}>
              {seg.text}
            </Text>
          ) : (
            <Text key={idx}>{seg.text}</Text>
          ),
        )}
      </Text>
    </View>
  );
};
