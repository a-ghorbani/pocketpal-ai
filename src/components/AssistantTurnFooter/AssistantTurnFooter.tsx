import React, {useContext} from 'react';
import {TouchableOpacity, View} from 'react-native';

import {Text} from 'react-native-paper';
import Clipboard from '@react-native-clipboard/clipboard';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

import {useTheme} from '../../hooks';

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
 * Turn-level chrome (timing + copy) rendered ONCE per assistant row,
 * below all step blocks. Per WHAT §4b / I1, the footer's two slots
 * render independently:
 *
 *   - `metadata.timings` present → render the timing line
 *   - `metadata.copyable` true   → render the copy button
 *
 * Each is gated only by field presence, not by run status (D1: "show
 * what we have"). On a turn aborted mid-stream with partial content,
 * `copyable` is true but `timings` is absent — the footer renders the
 * copy button alone (Scenario H).
 *
 * Per D9, this component is the universal owner of timing+copy chrome
 * for ALL assistant rows (legacy Text rows AND AssistantTurn rows).
 * Bubble (the shape primitive) no longer renders chrome.
 *
 * Sender-name handling stays where it is today — TextMessage renders
 * the author name above its text via `showName`. This component only
 * owns the below-bubble chrome.
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
      {copyable && (
        <TouchableOpacity onPress={copyToClipboard} testID="footer-copy">
          <Icon name="content-copy" style={componentStyles.icon} />
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
