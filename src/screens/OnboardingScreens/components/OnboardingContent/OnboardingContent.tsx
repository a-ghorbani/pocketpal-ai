import React from 'react';
import {View} from 'react-native';
import {Text} from 'react-native-paper';

import {useTheme} from '../../../../hooks';
import {createStyles} from './styles';

export type OnboardingContentProps = {
  /** Small top eyebrow ("Welcome to Pocket Pal" / "The idea" / …). */
  eyebrow?: string;
  /** Main title — typically wrapped in `ItalicAccentTitle`. */
  title: React.ReactNode;
  /** Body copy — typically `<HighlightText>` or a `<Text>` tree. */
  body?: React.ReactNode;
};

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
