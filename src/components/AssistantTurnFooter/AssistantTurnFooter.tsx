import React, {useContext} from 'react';
import {TouchableOpacity, View} from 'react-native';

import {observer} from 'mobx-react';
import {Text} from 'react-native-paper';
import Clipboard from '@react-native-clipboard/clipboard';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

import {CopyIcon} from '../../assets/icons';
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
}

export const AssistantTurnFooter: React.FC<AssistantTurnFooterProps> = observer(
  ({message}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const {copyable, timings, interrupted, truncationLikely, completionResult} =
      message.metadata || {};

    if (!timings && !copyable && !interrupted) {
      return null;
    }

    // The sticky context-full banner is the stronger surface for the turn that
    // drives it, so that turn shows plain interrupted status instead of "cut off".
    const suppressTruncated =
      truncationLikely === true &&
      completionResult != null &&
      completionResult === chatSessionStore.lastCompletionResult &&
      chatSessionStore.lastCompletionResult?.contextFull === true;

    const componentStyles = styles({theme});

    const timingParts: string[] = [];
    if (timings?.predicted_per_token_ms != null) {
      timingParts.push(
        t(l10n.components.bubble.msPerToken, {
          value: timings.predicted_per_token_ms.toFixed(),
        }),
      );
    }
    if (timings?.predicted_per_second != null) {
      timingParts.push(
        t(l10n.components.bubble.tokensPerSec, {
          value: timings.predicted_per_second.toFixed(2),
        }),
      );
    }
    if (timings?.prompt_per_second != null) {
      timingParts.push(
        t(l10n.components.bubble.promptTokensPerSec, {
          value: timings.prompt_per_second.toFixed(2),
        }),
      );
    }
    // Presence-gated, zero included: a build that does not report prompt-cache
    // reuse omits the key entirely, while a cold prompt on a build that does
    // reports 0. Those are different facts and read differently.
    if (timings?.cache_n != null) {
      timingParts.push(
        t(l10n.components.bubble.cachedTokens, {
          value: String(timings.cache_n),
        }),
      );
    }
    if (timings?.time_to_first_token_ms != null) {
      timingParts.push(
        t(l10n.components.bubble.ttft, {
          value: timings.time_to_first_token_ms,
        }),
      );
    }
    const fullTimingsString = timingParts.join(', ');

    const draftTokens = timings?.draft_tokens;
    const draftAccepted = timings?.draft_tokens_accepted ?? 0;
    const showDraft = draftTokens != null && draftTokens > 0;
    const draftPct = showDraft
      ? Math.round((draftAccepted / draftTokens) * 100)
      : 0;
    const draftString = showDraft
      ? t(l10n.components.bubble.draftAccepted, {
          accepted: String(draftAccepted),
          total: String(draftTokens),
          pct: String(draftPct),
        })
      : '';

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
        {timings && fullTimingsString ? (
          <Text style={componentStyles.timing} testID="footer-timing">
            {fullTimingsString}
          </Text>
        ) : null}
        {showDraft ? (
          <Text style={componentStyles.timing} testID="message-draft-tokens">
            {draftString}
          </Text>
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
