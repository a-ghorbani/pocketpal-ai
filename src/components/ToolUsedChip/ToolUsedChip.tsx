import React, {useContext, useMemo, useState} from 'react';
import {TouchableOpacity, View} from 'react-native';

import {Text} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import {useTheme} from '../../hooks';
import {stripUntrusted} from '../../services/talents/untrustedContent';

import {styles} from './styles';

import {L10nContext} from '../../utils';
import {t} from '../../locales';
import {
  AgentToolCall,
  AgentToolCallMetrics,
  AgentToolOutcome,
} from '../../utils/types';

interface ToolUsedChipProps {
  toolName: string;
  /**
   * Optional generation metrics — tokens emitted while the model
   * produced this call's arguments and the wall-clock duration.
   * Surfaced as a same-line suffix when present. Older persisted
   * tool calls won't carry metrics; the chip degrades gracefully.
   */
  metrics?: AgentToolCallMetrics;
  /** Persisted call, for the expanded arguments view. */
  call?: AgentToolCall;
  /** Persisted outcome, for the expanded response view. */
  outcome?: AgentToolOutcome;
}

const prettyArguments = (raw: string | undefined): string => {
  if (!raw) {
    return '';
  }
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
};

/**
 * "Used X" chip for tool calls with no registered TalentUI (e.g.
 * datetime, calculate). Renders nothing when `toolName` is empty.
 *
 * Tapping expands the persisted call and outcome. Nothing new is computed
 * here: the response was already redacted by the pipeline before it was
 * stored, so the chip only has to avoid putting it back together.
 */
const ToolUsedChipBase: React.FC<ToolUsedChipProps> = ({
  toolName,
  metrics,
  call,
  outcome,
}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const [expanded, setExpanded] = useState(false);

  const rawArguments = call?.function?.arguments ?? '';
  const rawResponse = outcome?.responseContent ?? '';
  // The chip re-renders per streaming token, and neither result is read until
  // it is expanded, so parsing and stripping stay behind that.
  const argumentsText = useMemo(
    () => (expanded ? prettyArguments(rawArguments) : ''),
    [expanded, rawArguments],
  );
  const responseText = useMemo(
    () => (expanded ? stripUntrusted(rawResponse) : ''),
    [expanded, rawResponse],
  );

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

  const row = (
    <>
      <Icon
        name="wrench-outline"
        style={componentStyles.icon}
        testID="tool-used-chip-icon"
      />
      <Text style={componentStyles.label}>{labelWithMetrics}</Text>
    </>
  );

  const strings = l10n.components.toolUsedChip;

  if (!rawArguments && !rawResponse) {
    return (
      <View style={componentStyles.container} testID="tool-used-chip">
        {row}
      </View>
    );
  }

  return (
    <View testID="tool-used-chip">
      <TouchableOpacity
        style={[componentStyles.container, componentStyles.tappable]}
        onPress={() => setExpanded(previous => !previous)}
        testID="tool-used-chip-toggle"
        accessibilityRole="button"
        accessibilityLabel={expanded ? strings.collapse : strings.expand}>
        {row}
      </TouchableOpacity>

      {expanded && (
        <View style={componentStyles.details} testID="tool-used-chip-details">
          {argumentsText ? (
            <View style={componentStyles.detailSection}>
              <Text style={componentStyles.detailLabel}>
                {strings.argumentsLabel}
              </Text>
              <Text
                style={componentStyles.detailText}
                testID="tool-used-chip-arguments"
                selectable>
                {argumentsText}
              </Text>
            </View>
          ) : null}

          {responseText ? (
            <View style={componentStyles.detailSection}>
              <Text style={componentStyles.detailLabel}>
                {strings.responseLabel}
              </Text>
              <Text
                style={componentStyles.detailText}
                testID="tool-used-chip-response"
                selectable>
                {responseText}
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
};

export const ToolUsedChip = React.memo(ToolUsedChipBase);
ToolUsedChip.displayName = 'ToolUsedChip';
