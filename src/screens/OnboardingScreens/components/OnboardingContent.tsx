import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';

import {useTheme} from '../../../hooks';
import type {Theme} from '../../../utils/types';

export type OnboardingContentProps = {
  /** Small top eyebrow ("Welcome to Pocket Pal" / "The idea" / …). */
  eyebrow?: string;
  /** Main title — typically wrapped in `ItalicAccentTitle`. */
  title: React.ReactNode;
  /** Body copy — typically `<HighlightText>` or a `<Text>` tree. */
  body?: React.ReactNode;
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      width: '100%',
      alignItems: 'center',
      gap: theme.spacing.s,
    },
    eyebrow: {
      ...theme.typography.bodyM,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
    },
    bodyWrap: {
      width: '100%',
      alignItems: 'center',
    },
  });

/**
 * "Contenet" block (Figma typo preserved as a node name) — the
 * eyebrow + title + body sandwich centered between the illustration
 * and the bottom bar on screens 1–4. Eyebrow uses `body/md` in
 * `onSurfaceVariant`. Title + body are passed in by the caller.
 */
export const OnboardingContent: React.FC<OnboardingContentProps> = ({
  eyebrow,
  title,
  body,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <View style={styles.root}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      {title}
      {body ? <View style={styles.bodyWrap}>{body}</View> : null}
    </View>
  );
};
