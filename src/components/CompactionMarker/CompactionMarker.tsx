import React, {useState, useContext} from 'react';
import {View, TouchableOpacity, Text} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import {useTheme} from '../../hooks';
import {MessageType} from '../../utils/types';
import {L10nContext} from '../../utils';
import {MarkdownView} from '../MarkdownView';
import {createStyles} from './styles';

interface CompactionMarkerProps {
  message: MessageType.Custom;
  messageWidth?: number;
}

export const CompactionMarker: React.FC<CompactionMarkerProps> = ({
  message,
  messageWidth = 320,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = useContext(L10nContext);

  const [isExpanded, setIsExpanded] = useState(false);

  const summary = message.metadata?.summary || message.metadata?.text || '';
  const count = message.metadata?.compactedCount ?? 0;
  const focus = message.metadata?.focusInstruction;

  const countString = count === 1 ? '1 message' : `${count} messages`;

  return (
    <View style={styles.container} testID="compaction-marker">
      <View style={styles.dividerRow}>
        <View style={styles.line} />
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.badge}
          onPress={() => setIsExpanded(prev => !prev)}
          accessibilityRole="button"
          accessibilityLabel={
            isExpanded
              ? l10n.chat?.hideSummary || 'Hide summary'
              : l10n.chat?.viewSummary || 'View summary'
          }>
          <Icon
            name="arrow-collapse-vertical"
            size={14}
            color={theme.colors.primary}
          />
          <Text style={styles.title}>
            {l10n.chat?.compactedMarkerTitle || 'Conversation Compacted'}
          </Text>
          <Text style={styles.countText}>({countString})</Text>
          <Icon
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={theme.colors.onSurfaceVariant}
          />
        </TouchableOpacity>
        <View style={styles.line} />
      </View>

      {focus ? (
        <View style={styles.focusTag}>
          <Text style={styles.focusText}>Focus: "{focus}"</Text>
        </View>
      ) : null}

      {isExpanded && summary ? (
        <View style={styles.summaryCard} testID="compaction-summary-card">
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryLabel}>
              {l10n.chat?.viewSummary || 'Context Summary'}
            </Text>
          </View>
          <MarkdownView
            markdownText={summary}
            maxMessageWidth={messageWidth - 32}
          />
        </View>
      ) : null}
    </View>
  );
};
