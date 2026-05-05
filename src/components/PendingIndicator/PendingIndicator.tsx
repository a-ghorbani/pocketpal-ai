import React, {useEffect, useRef} from 'react';
import {Animated, View} from 'react-native';

import {useTheme} from '../../hooks';

import {styles} from './styles';

import {Theme} from '../../utils/types';

interface DotProps {
  delay: number;
  theme: Theme;
}

const Dot: React.FC<DotProps> = ({delay, theme}) => {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 500,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0.3,
        duration: 500,
        useNativeDriver: true,
      }),
    ]);
    Animated.loop(animation).start();
  }, [opacity, delay]);

  return (
    <Animated.View
      style={[
        styles.dot,
        {
          backgroundColor: theme.colors.onSurfaceVariant,
          opacity,
        },
      ]}
    />
  );
};

/**
 * Subtle dot-row indicator owned by ChatView (WHAT §4d, D4, I4).
 * Replaces the louder LoadingBubble: same three-dot motion at lower
 * visual weight (smaller dots, no card background, low-prominence
 * theme colour), positioned below the latest turn so it covers
 * every dead zone in Scenario I phases 2, 4, 5, 7. Visibility
 * gating lives at ChatView (Step 11) — this component is a pure
 * decoration with no awareness of agent state.
 */
export const PendingIndicator: React.FC = () => {
  const theme = useTheme();

  return (
    <View style={styles.container} testID="pending-indicator">
      <Dot delay={0} theme={theme} />
      <Dot delay={200} theme={theme} />
      <Dot delay={400} theme={theme} />
    </View>
  );
};
