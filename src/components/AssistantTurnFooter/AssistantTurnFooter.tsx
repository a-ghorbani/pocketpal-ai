import React, {useContext} from 'react';
import {GestureResponderEvent, TouchableOpacity, View} from 'react-native';

import {observer} from 'mobx-react';
import {Text} from 'react-native-paper';
import Clipboard from '@react-native-clipboard/clipboard';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

import {
  ClockIcon,
  CopyIcon,
  RefreshIcon,
  DotsVerticalIcon,
} from '../../assets/icons';
import {useTheme} from '../../hooks';
import {PlayButton} from '../TextMessage/PlayButton';

import {styles} from './styles';

import {chatSessionStore} from '../../store';
import {L10nContext} from '../../utils';
import {derivedText} from '../../utils/chat';
import {MessageType} from '../../utils/types';
import {t} from '../../locales';

const hapticOptions = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

interface AssistantTurnFooterProps {
  message: MessageType.Any;
  /**
   * Regenerate the turn — wired to the existing "try again" action.
   * Absent for legacy/user rows; the button is omitted when undefined.
   */
  onRegenerate?: () => void;
  /**
   * Open the existing long-press action menu. Receives the press event so
   * the menu anchors at the tap position, same as a row long-press.
   */
  onMore?: (event: GestureResponderEvent) => void;
}

/**
 * Turn-level chrome (timing + copy + interrupt status) rendered once per
 * assistant row, below all step blocks. Each slot is gated only by field
 * presence:
 *
 *   - `metadata.timings` present       → render the timing line
 *   - `metadata.copyable` true         → render the copy button
 *   - `metadata.interrupted` true      → render the interrupted status
 *   - `metadata.truncationLikely` true → upgrade status to "cut off"
 *
 * On a turn aborted mid-stream with partial content, `copyable` is true
 * but `timings` is absent — the footer renders the copy button alone.
 * Used by both AssistantTurn rows and legacy assistant Text rows.
 */
export const AssistantTurnFooter: React.FC<AssistantTurnFooterProps> = observer(
  ({message, onRegenerate, onMore}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const {copyable, timings, interrupted, truncationLikely, completionResult} =
      message.metadata || {};

    if (!timings && !copyable && !interrupted) {
      return null;
    }

    // The sticky context-full banner is the single stronger surface for the
    // newest turn, so the footer drops its "cut off" wording on that turn and
    // shows plain interrupted status instead. Only the turn that drives the
    // banner is suppressed (its snapshot is the store's live one).
    const suppressTruncated =
      truncationLikely === true &&
      completionResult != null &&
      completionResult === chatSessionStore.lastCompletionResult &&
      chatSessionStore.lastCompletionResult?.contextFull === true;

    const componentStyles = styles({theme});

    // Compact timing chips: a clock glyph + value, one per metric,
    // bullet-separated. Each chip is independent; missing metrics are
    // omitted. ms/token is dropped from this surface.
    const timingChips: string[] = [];
    if (timings?.predicted_per_second != null) {
      timingChips.push(
        t(l10n.components.bubble.tokensPerSecCompact, {
          value: timings.predicted_per_second.toFixed(1),
        }),
      );
    }
    if (timings?.time_to_first_token_ms != null) {
      timingChips.push(
        t(l10n.components.bubble.ttftCompact, {
          value: timings.time_to_first_token_ms,
        }),
      );
    }

    const copyToClipboard = () => {
      if (message.type !== 'text' && message.type !== 'assistant_turn') {
        return;
      }
      ReactNativeHapticFeedback.trigger('impactLight', hapticOptions);
      Clipboard.setString(derivedText(message).trim());
    };

    return (
      <View style={componentStyles.container} testID="assistant-turn-footer">
        <PlayButton message={message} />
        {copyable && (
          <TouchableOpacity onPress={copyToClipboard} testID="footer-copy">
            <CopyIcon
              stroke={theme.colors.textSecondary}
              width={16}
              height={16}
            />
          </TouchableOpacity>
        )}
        {onRegenerate ? (
          <TouchableOpacity
            onPress={onRegenerate}
            testID="footer-regenerate"
            accessibilityRole="button"
            accessibilityLabel={
              l10n.components.assistantTurnFooter.regenerateAccessibilityLabel
            }
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <RefreshIcon
              stroke={theme.colors.textSecondary}
              width={16}
              height={16}
            />
          </TouchableOpacity>
        ) : null}
        {onMore ? (
          <TouchableOpacity
            onPress={onMore}
            testID="footer-more"
            accessibilityRole="button"
            accessibilityLabel={
              l10n.components.assistantTurnFooter.moreAccessibilityLabel
            }
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <DotsVerticalIcon
              fill={theme.colors.textSecondary}
              width={16}
              height={16}
            />
          </TouchableOpacity>
        ) : null}
        {timings && timingChips.length > 0 ? (
          <View
            style={componentStyles.timingRow}
            testID="footer-timing"
            accessible
            accessibilityLabel={timingChips.join(' · ')}>
            {timingChips.map((chip, index) => (
              <View key={chip} style={componentStyles.timingChip}>
                {index > 0 && <Text style={componentStyles.timing}>·</Text>}
                <ClockIcon
                  stroke={theme.colors.textSecondary}
                  width={12}
                  height={12}
                  importantForAccessibility="no"
                  accessibilityElementsHidden
                />
                <Text style={componentStyles.timing}>{chip}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {interrupted ? (
          <Text
            style={componentStyles.interruptedStatus}
            testID="footer-interrupted-status">
            {truncationLikely && !suppressTruncated
              ? l10n.components.bubble.truncated
              : l10n.components.bubble.interrupted}
          </Text>
        ) : null}
      </View>
    );
  },
);
