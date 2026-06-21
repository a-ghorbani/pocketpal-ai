import React, {useContext} from 'react';
import {View} from 'react-native';

import {Text} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import {useTheme} from '../../hooks';

import {styles} from './styles';

import {L10nContext} from '../../utils';
import {t} from '../../locales';
import {AgentToolCallMetrics} from '../../utils/types';

interface ToolUsedChipProps {
  toolName: string;
  /**
   * Optional generation metrics — tokens emitted while the model
   * produced this call's arguments and the wall-clock duration.
   * Surfaced as a same-line suffix when present. Older persisted
   * tool calls won't carry metrics; the chip degrades gracefully.
   */
  metrics?: AgentToolCallMetrics;
}

/**
 * "Used X" chip for tool calls with no registered TalentUI (e.g.
 * datetime, calculate). Renders nothing when `toolName` is empty.
 */
export const ToolUsedChip: React.FC<ToolUsedChipProps> = ({
  toolName,
  metrics,
}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);

  if (!toolName) {
    return null;
  }

  const componentStyles = styles({theme});
  const baseLabel = t(l10n.chat.toolUsedChip, {name: toolName});
  const labelWithMetrics =
    metrics && metrics.tokens > 0
      ? `${baseLabel} · ${t(l10n.components.toolMetrics.tokens, {
          count: metrics.tokens.toLocaleString(),
        })} · ${t(l10n.components.toolMetrics.elapsed, {
          seconds: Math.max(1, Math.round(metrics.durationMs / 1000)),
        })}`
      : baseLabel;

  return (
    <View style={componentStyles.container} testID="tool-used-chip">
      <Icon
        name="wrench-outline"
        style={componentStyles.icon}
        testID="tool-used-chip-icon"
      />
      <Text style={componentStyles.label}>{labelWithMetrics}</Text>
    </View>
  );
};
