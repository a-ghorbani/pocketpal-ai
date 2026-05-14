import React, {useContext} from 'react';
import {TouchableOpacity, View} from 'react-native';

import {Text} from 'react-native-paper';
import Clipboard from '@react-native-clipboard/clipboard';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

import {CopyIcon} from '../../assets/icons';
import {useTheme} from '../../hooks';
import {PlayButton} from '../TextMessage/PlayButton';

import {styles} from './styles';

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

/**
 * Turn-level chrome (timing + copy) rendered once per assistant row,
 * below all step blocks. Each slot is gated only by field presence:
 *
 *   - `metadata.timings` present → render the timing line
 *   - `metadata.copyable` true   → render the copy button
 *
 * On a turn aborted mid-stream with partial content, `copyable` is true
 * but `timings` is absent — the footer renders the copy button alone.
 * Used by both AssistantTurn rows and legacy assistant Text rows.
 */
export const AssistantTurnFooter: React.FC<AssistantTurnFooterProps> = ({
  message,
}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const {copyable, timings} = message.metadata || {};

  if (!timings && !copyable) {
    return null;
  }

  const componentStyles = styles({theme});

  // Build timing string from whichever parts are available. Each part
  // is independent; missing parts are omitted from the joined string.
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
  if (timings?.time_to_first_token_ms != null) {
    timingParts.push(
      t(l10n.components.bubble.ttft, {
        value: timings.time_to_first_token_ms,
      }),
    );
  }
  const fullTimingsString = timingParts.join(', ');

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
        <TouchableOpacity
          onPress={copyToClipboard}
          testID="footer-copy"
          style={componentStyles.copyButton}>
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
    </View>
  );
};
