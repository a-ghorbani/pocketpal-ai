import React, {useContext, useEffect, useRef, useState} from 'react';
import {Animated, Text, View} from 'react-native';

import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';
import {t} from '../../locales';

import {styles, createCountStyle} from './styles';

import {Theme} from '../../utils/types';

// Suppress the count for trivial in-progress calls so simple talents
// don't trade a dot-row for "1 tokens" the moment they start. The
// threshold is small enough that the user sees the count appear
// within the first few tokens of any non-trivial tool call.
const MIN_TOKENS = 10;

// Map talent name → l10n key under `components.pendingIndicator`.
// Keeping the mapping local to the renderer avoids leaking React-
// context-bound l10n into the service layer. New talents that want
// a label add an entry here; otherwise they fall back to the
// generic "Preparing tool".
const TALENT_LABEL_KEYS: Record<
  string,
  'buildingPage' | 'calculating' | 'lookingUpTime'
> = {
  render_html: 'buildingPage',
  calculate: 'calculating',
  datetime: 'lookingUpTime',
};

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

interface PendingIndicatorProps {
  /**
   * Names of tool calls the model is currently generating. The first
   * name (if any) drives the friendly label ("Building page", etc.).
   * Empty / undefined → no label, plain dot-row.
   */
  pendingTalentNames?: string[];
  /**
   * Number of token events received during the current tool-call
   * generation. Surfaced once it crosses {@link MIN_TOKENS}.
   */
  pendingToolTokens?: number;
}

/**
 * Subtle dot-row indicator owned by ChatView (WHAT §4d, D4, I4).
 * Replaces the louder LoadingBubble: same three-dot motion at lower
 * visual weight (smaller dots, no card background, low-prominence
 * theme colour), positioned below the latest turn so it covers
 * every dead zone in Scenario I phases 2, 4, 5, 7.
 *
 * For long tool calls (e.g. `render_html` building a complex page)
 * the bare dots aren't enough to tell the user it's still working.
 * When `pendingTalentNames` is non-empty, the indicator additionally
 * renders:
 *   1. A friendly label per talent (e.g. "Building page").
 *   2. The token count once it crosses the threshold.
 *   3. Elapsed seconds once at least one second has passed.
 *
 * Visibility gating (whether the indicator renders at all) lives at
 * ChatView (Step 11) — this component is a pure decoration.
 */
export const PendingIndicator: React.FC<PendingIndicatorProps> = ({
  pendingTalentNames,
  pendingToolTokens = 0,
}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const countStyle = createCountStyle(theme).count;

  const firstTalent = pendingTalentNames?.[0];
  const inToolCallMode = !!firstTalent;

  // Elapsed seconds tracker. Starts when we enter tool-call mode,
  // resets when we leave. Uses a 1-second interval — coarse enough
  // not to thrash the UI, fine enough to reassure "still going".
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    if (!inToolCallMode) {
      setElapsedSec(0);
      return;
    }
    const startedAt = Date.now();
    const interval = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [inToolCallMode]);

  // Build the label suffix: "Building page · 120 tokens · 4s"
  let suffix: string | null = null;
  if (inToolCallMode) {
    const labelKey = firstTalent ? TALENT_LABEL_KEYS[firstTalent] : undefined;
    const label = labelKey
      ? l10n.components.pendingIndicator[labelKey]
      : l10n.components.pendingIndicator.preparingTool;
    const parts: string[] = [label];
    if (pendingToolTokens >= MIN_TOKENS) {
      parts.push(
        t(l10n.components.pendingIndicator.tokens, {
          count: pendingToolTokens.toLocaleString(),
        }),
      );
    }
    if (elapsedSec >= 1) {
      parts.push(
        t(l10n.components.pendingIndicator.elapsed, {seconds: elapsedSec}),
      );
    }
    suffix = parts.join(' · ');
  }

  return (
    <View style={styles.container} testID="pending-indicator">
      <Dot delay={0} theme={theme} />
      <Dot delay={200} theme={theme} />
      <Dot delay={400} theme={theme} />
      {suffix !== null && (
        <Text style={countStyle} testID="pending-indicator-suffix">
          {suffix}
        </Text>
      )}
    </View>
  );
};
