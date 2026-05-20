import React, {useContext} from 'react';
import {View} from 'react-native';

import {Text} from 'react-native-paper';

import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';
import {t} from '../../locales';
import {AgentToolCallMetrics} from '../../utils/types';

import {styles} from './styles';

interface ToolMetricsFooterProps {
  metrics: AgentToolCallMetrics;
}

/**
 * Small post-hoc footer rendered beneath a talent UI's result (e.g.
 * the HTML preview), showing how much the model "spent" on the tool
 * call: `1,500 tokens · 35s`. Visually aligned with
 * AssistantTurnFooter (same fontSize / colour) so it reads as part
 * of the same chrome family without competing with the result above.
 *
 * Renders nothing if `metrics.tokens` is 0 — that's the cue for
 * "metrics absent" (older persisted calls, or steps where the runner
 * didn't see any tool-call tokens).
 */
export const ToolMetricsFooter: React.FC<ToolMetricsFooterProps> = ({
  metrics,
}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);

  if (metrics.tokens <= 0) {
    return null;
  }

  const componentStyles = styles({theme});
  const seconds = Math.max(1, Math.round(metrics.durationMs / 1000));
  const text = `${t(l10n.components.toolMetrics.tokens, {
    count: metrics.tokens.toLocaleString(),
  })} · ${t(l10n.components.toolMetrics.elapsed, {seconds})}`;

  return (
    <View style={componentStyles.container} testID="tool-metrics-footer">
      <Text style={componentStyles.text}>{text}</Text>
    </View>
  );
};
