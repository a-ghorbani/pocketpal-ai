import React, {useMemo} from 'react';
import {Text, View} from 'react-native';

import {useTheme} from '../../hooks';

import {createStyles} from './styles';

interface GreetingBubbleProps {
  text: string;
}

/**
 * Non-persistent greeting rendered as a chat header for empty sessions.
 * Visually distinct from real assistant bubbles (italic, accent border, icon).
 *
 * IMPORTANT: This is UI scaffolding only. It is NOT a `session.messages` entry,
 * is NOT persisted to the DB, and is NOT included in `convertToChatMessages`.
 */
export const GreetingBubble: React.FC<GreetingBubbleProps> = ({text}) => {
  const theme = useTheme();

  const styles = useMemo(
    () =>
      createStyles({
        background: theme.colors.surfaceVariant,
        border: theme.colors.outline,
        text: theme.colors.onSurfaceVariant,
        accent: theme.colors.primary,
      }),
    [theme],
  );

  return (
    <View style={styles.container} testID="greeting-bubble">
      <Text style={styles.icon}>👋</Text>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
};
