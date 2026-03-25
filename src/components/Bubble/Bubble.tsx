import type {ReactNode} from 'react';
import React, {useContext} from 'react';
import {View, TouchableOpacity, Animated} from 'react-native';

import {Text} from 'react-native-paper';
import Clipboard from '@react-native-clipboard/clipboard';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

import {useTheme} from '../../hooks';

import {styles} from './styles';

import {UserContext, L10nContext} from '../../utils';
import {MessageType} from '../../utils/types';
import {t} from '../../locales';

const hapticOptions = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

export const Bubble = ({
  child,
  message,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  nextMessageInGroup,
  scale = new Animated.Value(1),
}: {
  child: ReactNode;
  message: MessageType.Any;
  nextMessageInGroup: boolean;
  scale?: Animated.Value;
}) => {
  const theme = useTheme();
  const user = useContext(UserContext);
  const l10n = useContext(L10nContext);
  const currentUserIsAuthor = user?.id === message.author.id;
  const {copyable, timings} = message.metadata || {};

  // Build timing string from whichever parts are available
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

  const {contentContainer, dateHeaderContainer, dateHeader, iconContainer} =
    styles({
      currentUserIsAuthor,
      message,
      roundBorder: true,
      theme,
    });

  const copyToClipboard = () => {
    if (message.type === 'text') {
      ReactNativeHapticFeedback.trigger('impactLight', hapticOptions);
      Clipboard.setString(message.text.trim());
    }
  };

  return (
    <Animated.View
      testID={currentUserIsAuthor ? 'user-message' : 'ai-message'}
      style={[
        contentContainer,
        {
          transform: [{scale}],
        },
      ]}>
      {child}
      {timings && (
        <View style={dateHeaderContainer} testID="message-timing">
          {copyable && (
            <TouchableOpacity onPress={copyToClipboard}>
              <Icon name="content-copy" style={iconContainer} />
            </TouchableOpacity>
          )}
          {fullTimingsString ? (
            <Text style={dateHeader}>{fullTimingsString}</Text>
          ) : null}
        </View>
      )}
    </Animated.View>
  );
};
